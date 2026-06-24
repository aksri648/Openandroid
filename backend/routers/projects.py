import asyncio
import os
import uuid
from datetime import datetime, timezone

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import (
    insert_project,
    get_project,
    list_projects,
    update_project,
    delete_project as db_delete_project,
    get_settings,
    insert_log,
)

router = APIRouter()

APPROVAL_REQUIRED_TOOLS = {
    "write_file",
    "edit_file",
    "create_file",
    "execute_command",
    "run_command",
    "shell_exec",
    "str_replace_editor",
}


class CreateProjectRequest(BaseModel):
    name: str
    prompt: str
    approval_mode: bool = True


class ApproveRequest(BaseModel):
    action_id: str
    modified_content: str | None = None


class RejectRequest(BaseModel):
    action_id: str
    reason: str = ""


@router.post("/create")
async def create_project(body: CreateProjectRequest, user: dict = CurrentUser):
    from main import log_queues

    user_id = user["user_id"]
    project_id = str(uuid.uuid4())

    project_doc = {
        "project_id": project_id,
        "name": body.name,
        "status": "initializing",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "zip_ready": False,
        "logs": [],
        "approval_mode": body.approval_mode,
    }

    await insert_project(user_id, project_doc)
    log_queues[project_id] = asyncio.Queue()

    asyncio.create_task(run_opencode_job(project_id, user_id, body.prompt, body.approval_mode))

    return {"project_id": project_id, "status": "initializing"}


@router.get("/list")
async def list_projects_endpoint(user: dict = CurrentUser):
    user_id = user["user_id"]
    projects = await list_projects(user_id)
    return {"projects": projects}


@router.get("/{project_id}")
async def get_project_endpoint(project_id: str, user: dict = CurrentUser):
    user_id = user["user_id"]
    project = await get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def delete_project_endpoint(project_id: str, user: dict = CurrentUser):
    from main import approval_store, log_queues, sandboxes_store

    user_id = user["user_id"]
    project = await get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_id in sandboxes_store:
        try:
            from daytona import AsyncDaytona

            daytona = AsyncDaytona()
            await daytona.delete(sandboxes_store[project_id])
            del sandboxes_store[project_id]
        except Exception:
            pass

    await db_delete_project(user_id, project_id)
    log_queues.pop(project_id, None)
    approval_store.pop(project_id, None)

    zip_path = project.get("zip_path")
    if zip_path and os.path.exists(zip_path):
        os.remove(zip_path)

    return {"status": "deleted"}


# ── Approval endpoints ──────────────────────────────────────────────────────


@router.post("/{project_id}/approve")
async def approve_action(project_id: str, body: ApproveRequest, user: dict = CurrentUser):
    from main import approval_store

    user = user
    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approval = approval_store.get(project_id)
    if not approval:
        raise HTTPException(status_code=400, detail="No pending approval")

    for action in approval["actions"]:
        if action["id"] == body.action_id:
            action["approved"] = True
            action["modified_content"] = body.modified_content
            break
    else:
        raise HTTPException(status_code=404, detail="Action not found")

    approval["event"].set()
    return {"status": "approved"}


@router.post("/{project_id}/reject")
async def reject_action(project_id: str, body: RejectRequest, user: dict = CurrentUser):
    from main import approval_store, log_queues

    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approval = approval_store.get(project_id)
    if not approval:
        raise HTTPException(status_code=400, detail="No pending approval")

    for action in approval["actions"]:
        if action["id"] == body.action_id:
            action["approved"] = False
            action["reason"] = body.reason
            break
    else:
        raise HTTPException(status_code=404, detail="Action not found")

    approval["event"].set()

    queue = log_queues.get(project_id)
    if queue:
        await queue.put({
            "level": "system",
            "message": f"⏭ Action rejected: {action.get('tool_name', 'unknown')} — {body.reason or 'No reason given'}",
        })

    return {"status": "rejected"}


@router.get("/{project_id}/pending-approvals")
async def get_pending_approvals(project_id: str, user: dict = CurrentUser):
    from main import approval_store

    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approval = approval_store.get(project_id)
    if not approval:
        return {"actions": []}

    pending = [a for a in approval["actions"] if a.get("approved") is None]
    return {"actions": pending}


# ── Core background job ─────────────────────────────────────────────────────


async def wait_for_action_approval(project_id: str, action: dict, timeout: float = 120.0) -> bool:
    from main import approval_store, log_queues

    queue = log_queues.get(project_id)

    if project_id not in approval_store:
        approval_store[project_id] = {
            "event": asyncio.Event(),
            "actions": [],
        }

    approval = approval_store[project_id]
    approval["actions"].append(action)

    if queue:
        await queue.put({
            "level": "approval_needed",
            "action": action,
            "message": f"Approval required: {action.get('tool_name', 'unknown')}",
        })

    approval["event"].clear()

    try:
        await asyncio.wait_for(approval["event"].wait(), timeout=timeout)
    except asyncio.TimeoutError:
        action["approved"] = False
        action["reason"] = "Timed out"
        if queue:
            await queue.put({
                "level": "system",
                "message": f"⏱ Approval timed out for: {action.get('tool_name', 'unknown')}",
            })
        return False

    return action.get("approved", False)


def extract_file_preview(tool_input: dict, tool_name: str) -> dict:
    if tool_name in ("write_file", "create_file"):
        path = tool_input.get("path", tool_input.get("file_path", "unknown"))
        content = tool_input.get("content", tool_input.get("file_text", ""))
        return {
            "type": "file_write",
            "path": path,
            "content": content,
            "preview": content[:500] + ("..." if len(content) > 500 else ""),
        }
    elif tool_name in ("edit_file", "str_replace_editor"):
        path = tool_input.get("path", tool_input.get("file_path", "unknown"))
        old = tool_input.get("old_str", tool_input.get("old_string", ""))
        new = tool_input.get("new_str", tool_input.get("new_string", ""))
        return {
            "type": "file_edit",
            "path": path,
            "old_content": old,
            "new_content": new,
            "preview": f"Replace:\n{old[:200]}\n→\n{new[:200]}",
        }
    elif tool_name in ("execute_command", "run_command", "shell_exec"):
        cmd = tool_input.get("command", tool_input.get("cmd", ""))
        return {
            "type": "command",
            "command": cmd,
            "preview": cmd,
        }
    else:
        return {
            "type": "unknown",
            "tool_name": tool_name,
            "input": tool_input,
            "preview": str(tool_input)[:300],
        }


async def run_opencode_job(
    project_id: str, user_id: str, prompt: str, approval_mode: bool = True
):
    from daytona import AsyncDaytona, CreateSandboxFromImageParams, Image, Resources
    from opencode_ai import AsyncOpencode

    from main import approval_store, log_queues, sandboxes_store

    queue = log_queues[project_id]

    # Get LLM config from settings
    settings = await get_settings(user_id)
    llm_providers = settings.get("llm_providers", [])
    llm_config = next((p for p in llm_providers if p.get("is_default")), llm_providers[0] if llm_providers else None)

    async def log(msg: str, level: str = "info"):
        await queue.put({"level": level, "message": msg, "ts": datetime.now(timezone.utc).isoformat()})
        await update_project(user_id, project_id, {
            "$push": {"logs": {"level": level, "message": msg}},
        })

    try:
        await log("🚀 Spinning up sandbox...", "system")
        await update_project(user_id, project_id, {"status": "creating_sandbox"})

        daytona = AsyncDaytona()
        sandbox = await daytona.create(
            CreateSandboxFromImageParams(
                image=Image.debian_slim("3.11"),
                resources=Resources(cpu=2, memory=4, disk=8),
                env_vars={
                    "ANTHROPIC_API_KEY": llm_config.get("api_key", "") if llm_config else "",
                    "OPENAI_API_KEY": llm_config.get("api_key", "") if llm_config else "",
                    "OPENCODE_MODEL": llm_config.get("model", "anthropic/claude-sonnet-4-5")
                    if llm_config
                    else "anthropic/claude-sonnet-4-5",
                },
                auto_stop_interval=30,
                auto_delete_interval=60,
            )
        )
        sandboxes_store[project_id] = sandbox
        await update_project(user_id, project_id, {"sandbox_id": sandbox.id})
        await log(f"✅ Sandbox created: {sandbox.id}", "system")

        await log("📦 Installing OpenCode agent...", "system")
        await update_project(user_id, project_id, {"status": "installing"})

        install_result = await sandbox.process.exec(
            "curl -fsSL https://opencode.ai/install | bash", timeout=120
        )
        if install_result.exit_code != 0:
            raise Exception(f"OpenCode install failed: {install_result.result}")
        await log("✅ OpenCode installed", "system")

        workspace_path = "/home/daytona/workspace"
        await sandbox.process.exec(f"mkdir -p {workspace_path}")

        await log("🌐 Starting OpenCode server...", "system")

        await sandbox.process.exec(
            f"cd {workspace_path} && nohup opencode serve --port 54321 > /tmp/opencode-server.log 2>&1 &",
            timeout=10,
        )

        await log("⏳ Waiting for OpenCode server to be ready...", "system")
        server_ready = False
        for attempt in range(30):
            health_check = await sandbox.process.exec(
                "curl -s http://localhost:54321/app 2>&1 | head -c 100"
            )
            if health_check.exit_code == 0 and "error" not in health_check.result.lower()[:50]:
                server_ready = True
                break
            await asyncio.sleep(1)

        if not server_ready:
            raise Exception("OpenCode server failed to start within 30 seconds")
        await log("✅ OpenCode server ready on :54321", "system")

        sandbox_base_url = await sandbox.get_preview_url(54321)
        await log(f"🔗 OpenCode accessible at: {sandbox_base_url}", "system")

        opencode_client = AsyncOpencode(base_url=sandbox_base_url)

        await log("📋 Initializing OpenCode session...", "system")
        await update_project(user_id, project_id, {"status": "running"})

        await opencode_client.app.init()
        session = await opencode_client.session.create()
        session_id = session.id
        await update_project(user_id, project_id, {"session_id": session_id})
        await log(f"✅ Session created: {session_id}", "system")

        pending_tool_calls: dict[str, dict] = {}

        async def consume_opencode_events():
            try:
                stream = await opencode_client.event.list()
                async for event in stream:
                    event_dict = event.to_dict() if hasattr(event, "to_dict") else vars(event)
                    event_type = event_dict.get("type", "unknown")

                    if event_type == "message.part.updated":
                        part = event_dict.get("part", {})
                        if part.get("type") == "text":
                            text = part.get("text", {}).get("value", "")
                            if text:
                                await log(text, "agent")

                    elif event_type == "tool.use":
                        tool_name = event_dict.get("tool", {}).get("name", "")
                        tool_input = event_dict.get("tool", {}).get("input", {})
                        tool_id = event_dict.get("tool", {}).get("id", str(uuid.uuid4()))

                        if approval_mode and tool_name in APPROVAL_REQUIRED_TOOLS:
                            preview = extract_file_preview(tool_input, tool_name)
                            action_id = f"action-{tool_id[:12]}"

                            action = {
                                "id": action_id,
                                "tool_id": tool_id,
                                "tool_name": tool_name,
                                "tool_input": tool_input,
                                "preview": preview,
                                "approved": None,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }

                            pending_tool_calls[action_id] = action
                            approved = await wait_for_action_approval(project_id, action, timeout=120.0)

                            if approved:
                                await log(f"✅ Approved: {tool_name} — {preview['preview'][:80]}", "system")
                                if action.get("modified_content") and preview["type"] == "file_write":
                                    tool_input["content"] = action["modified_content"]
                            else:
                                await log(f"⏭ Skipped: {tool_name} — {action.get('reason', 'Rejected')}", "system")
                        else:
                            await log(f"🔧 Tool: {tool_name} — {str(tool_input)[:120]}", "tool")

                    elif event_type == "step.start":
                        await log("▶ Step started", "step")
                    elif event_type == "step.finish":
                        await log("✅ Step complete", "step")
                    elif event_type == "session.error":
                        error_msg = event_dict.get("error", {}).get("message", "Unknown error")
                        await log(f"❌ Error: {error_msg}", "error")
                    else:
                        await log(f"[{event_type}] {str(event_dict)[:200]}", "debug")

            except Exception as e:
                await log(f"Event stream ended: {e}", "system")

        event_task = asyncio.create_task(consume_opencode_events())

        if approval_mode:
            await log("📋 Requesting execution plan...", "system")
            plan_prompt = (
                f"{prompt}\n\n"
                "IMPORTANT: Before executing, first provide a detailed plan of all files you will "
                "create/edit and all commands you will run. List each action as a numbered step. "
                "After presenting the plan, wait for user approval before proceeding with execution."
            )

            await queue.put({
                "level": "plan_requested",
                "message": "Agent is creating a plan...",
            })

            result = await opencode_client.session.chat(
                session_id, parts=[{"type": "text", "text": plan_prompt}]
            )

            await log("📋 Plan presented. Waiting for user approvals...", "system")
        else:
            await log("💬 Sending prompt to agent...", "system")
            await log(f"Prompt: {prompt[:200]}{'...' if len(prompt) > 200 else ''}", "user")

            result = await opencode_client.session.chat(
                session_id, parts=[{"type": "text", "text": prompt}]
            )

        await log("✅ Agent completed task", "system")
        await update_project(user_id, project_id, {"status": "zipping"})

        event_task.cancel()
        try:
            await event_task
        except asyncio.CancelledError:
            pass

        await log("📦 Zipping workspace...", "system")
        zip_filename = f"project-{project_id[:8]}.zip"
        zip_remote_path = f"/tmp/{zip_filename}"

        zip_result = await sandbox.process.exec(
            f"cd /home/daytona && zip -r {zip_remote_path} workspace/", timeout=60
        )
        if zip_result.exit_code != 0:
            raise Exception(f"Zip failed: {zip_result.result}")

        local_zip_dir = os.getenv("WORKSPACE_DIR", "/tmp/opencode-workspaces")
        os.makedirs(local_zip_dir, exist_ok=True)
        local_zip_path = f"{local_zip_dir}/{project_id}.zip"

        zip_bytes = await sandbox.fs.download_file(zip_remote_path)
        with open(local_zip_path, "wb") as f:
            f.write(zip_bytes)

        await update_project(user_id, project_id, {
            "zip_path": local_zip_path,
            "zip_size": len(zip_bytes),
            "zip_ready": True,
            "status": "done",
        })

        await log(f"✅ Done! ZIP ready ({len(zip_bytes) // 1024}KB)", "system")

        tree_result = await sandbox.process.exec(
            f"find {workspace_path} -type f | sed 's|{workspace_path}/||' | head -200",
            timeout=10,
        )
        if tree_result.exit_code == 0:
            file_paths = [p for p in tree_result.result.split("\n") if p.strip()]
            await update_project(user_id, project_id, {"file_tree": file_paths})

        await queue.put({"level": "done", "message": "GENERATION_COMPLETE", "zip_ready": True})

    except Exception as e:
        await log(f"❌ Fatal error: {str(e)}", "error")
        await update_project(user_id, project_id, {
            "status": "failed",
            "error": str(e),
        })
        await queue.put({"level": "error", "message": f"FATAL: {str(e)}"})

    finally:
        if project_id in sandboxes_store:
            try:
                sandbox = sandboxes_store[project_id]
                daytona = AsyncDaytona()
                await daytona.delete(sandbox)
                del sandboxes_store[project_id]
                await log("🧹 Sandbox cleaned up", "system")
            except Exception:
                pass
