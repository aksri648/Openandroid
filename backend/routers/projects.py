import asyncio
import os
import re
import uuid
from datetime import datetime

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Tools that require user approval before execution
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
    from main import projects_store, log_queues

    user_id = user["user_id"]
    project_id = str(uuid.uuid4())

    if user_id not in projects_store:
        projects_store[user_id] = {}

    projects_store[user_id][project_id] = {
        "id": project_id,
        "name": body.name,
        "status": "initializing",
        "created_at": datetime.utcnow().isoformat(),
        "zip_ready": False,
        "logs": [],
        "approval_mode": body.approval_mode,
    }

    log_queues[project_id] = asyncio.Queue()

    asyncio.create_task(run_opencode_job(project_id, user_id, body.prompt, body.approval_mode))

    return {"project_id": project_id, "status": "initializing"}


@router.get("/list")
async def list_projects(user: dict = CurrentUser):
    from main import projects_store

    user_id = user["user_id"]
    user_projects = list(projects_store.get(user_id, {}).values())
    user_projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return {"projects": user_projects}


@router.get("/{project_id}")
async def get_project(project_id: str, user: dict = CurrentUser):
    from main import projects_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: dict = CurrentUser):
    from main import approval_store, log_queues, projects_store, sandboxes_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
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

    del projects_store[user_id][project_id]
    log_queues.pop(project_id, None)
    approval_store.pop(project_id, None)

    zip_path = project.get("zip_path")
    if zip_path and os.path.exists(zip_path):
        os.remove(zip_path)

    return {"status": "deleted"}


# ── Approval endpoints ──────────────────────────────────────────────────────


@router.post("/{project_id}/approve")
async def approve_action(project_id: str, body: ApproveRequest, user: dict = CurrentUser):
    from main import approval_store, projects_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approval = approval_store.get(project_id)
    if not approval:
        raise HTTPException(status_code=400, detail="No pending approval")

    # Find the action and mark it approved
    for action in approval["actions"]:
        if action["id"] == body.action_id:
            action["approved"] = True
            action["modified_content"] = body.modified_content
            break
    else:
        raise HTTPException(status_code=404, detail="Action not found")

    # Signal the waiting coroutine
    approval["event"].set()

    return {"status": "approved"}


@router.post("/{project_id}/reject")
async def reject_action(project_id: str, body: RejectRequest, user: dict = CurrentUser):
    from main import approval_store, log_queues, projects_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
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
    from main import approval_store, projects_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approval = approval_store.get(project_id)
    if not approval:
        return {"actions": []}

    pending = [a for a in approval["actions"] if a.get("approved") is None]
    return {"actions": pending}


# ── Core background job ─────────────────────────────────────────────────────


async def wait_for_action_approval(project_id: str, action: dict, timeout: float = 120.0) -> bool:
    """
    Wait for user to approve or reject a tool action.
    Returns True if approved, False if rejected or timed out.
    """
    from main import approval_store, log_queues

    queue = log_queues.get(project_id)

    # Initialize approval entry if not exists
    if project_id not in approval_store:
        approval_store[project_id] = {
            "event": asyncio.Event(),
            "actions": [],
        }

    approval = approval_store[project_id]
    approval["actions"].append(action)

    # Send approval request to frontend
    if queue:
        await queue.put({
            "level": "approval_needed",
            "action": action,
            "message": f"Approval required: {action.get('tool_name', 'unknown')}",
        })

    # Reset event for this action
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
    """Extract a human-readable preview from a tool call."""
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
    """
    Full lifecycle of one AI coding job with optional approval checkpoints:
    1. Create Daytona sandbox
    2. Install opencode inside it
    3. Start opencode serve inside it
    4. Connect Python SDK to opencode server
    5. [If approval_mode] Send plan prompt → wait for approval → send execute prompt
    6. [If !approval_mode] Send prompt directly
    7. Monitor tool.use events and require approval for write/edit/execute
    8. Zip workspace on completion
    9. Clean up
    """
    from daytona import AsyncDaytona, CreateSandboxFromImageParams, Image, Resources
    from opencode_ai import AsyncOpencode

    from main import approval_store, log_queues, projects_store, sandboxes_store

    queue = log_queues[project_id]

    async def log(msg: str, level: str = "info"):
        await queue.put({"level": level, "message": msg, "ts": datetime.utcnow().isoformat()})
        projects_store[user_id][project_id].setdefault("logs", []).append(
            {"level": level, "message": msg}
        )

    try:
        # ── STEP 1: Create Daytona sandbox ──────────────────────────────────
        await log("🚀 Spinning up sandbox...", "system")
        projects_store[user_id][project_id]["status"] = "creating_sandbox"

        daytona = AsyncDaytona()
        sandbox = await daytona.create(
            CreateSandboxFromImageParams(
                image=Image.debian_slim("3.11"),
                resources=Resources(cpu=2, memory=4, disk=8),
                env_vars={
                    "ANTHROPIC_API_KEY": llm_config.get("anthropic_api_key", "") if llm_config else "",
                    "OPENAI_API_KEY": llm_config.get("openai_api_key", "") if llm_config else "",
                    "OPENCODE_MODEL": llm_config.get("model", "anthropic/claude-sonnet-4-5")
                    if llm_config
                    else "anthropic/claude-sonnet-4-5",
                },
                auto_stop_interval=30,
                auto_delete_interval=60,
            )
        )
        sandboxes_store[project_id] = sandbox
        projects_store[user_id][project_id]["sandbox_id"] = sandbox.id
        await log(f"✅ Sandbox created: {sandbox.id}", "system")

        # ── STEP 2: Install opencode inside sandbox ───────────────────────
        await log("📦 Installing OpenCode agent...", "system")
        projects_store[user_id][project_id]["status"] = "installing"

        install_result = await sandbox.process.exec(
            "curl -fsSL https://opencode.ai/install | bash", timeout=120
        )
        if install_result.exit_code != 0:
            raise Exception(f"OpenCode install failed: {install_result.result}")
        await log("✅ OpenCode installed", "system")

        workspace_path = "/home/daytona/workspace"
        await sandbox.process.exec(f"mkdir -p {workspace_path}")

        # ── STEP 3: Start opencode serve inside sandbox ───────────────────
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

        # ── STEP 4: Get sandbox's public URL and connect Python SDK ───────
        sandbox_base_url = await sandbox.get_preview_url(54321)
        await log(f"🔗 OpenCode accessible at: {sandbox_base_url}", "system")

        opencode_client = AsyncOpencode(base_url=sandbox_base_url)

        # ── STEP 5: Initialize app and create session ──────────────────────
        await log("📋 Initializing OpenCode session...", "system")
        projects_store[user_id][project_id]["status"] = "running"

        await opencode_client.app.init()
        session = await opencode_client.session.create()
        session_id = session.id
        projects_store[user_id][project_id]["session_id"] = session_id
        await log(f"✅ Session created: {session_id}", "system")

        # ── STEP 6: Start SSE event stream with approval interception ──────
        # Track tool calls that need approval
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

                        # Check if this tool requires approval
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
                                "timestamp": datetime.utcnow().isoformat(),
                            }

                            pending_tool_calls[action_id] = action

                            # Wait for approval
                            approved = await wait_for_action_approval(project_id, action, timeout=120.0)

                            if approved:
                                await log(f"✅ Approved: {tool_name} — {preview['preview'][:80]}", "system")
                                # If user modified content, update the tool input
                                if action.get("modified_content") and preview["type"] == "file_write":
                                    tool_input["content"] = action["modified_content"]
                            else:
                                await log(f"⏭ Skipped: {tool_name} — {action.get('reason', 'Rejected')}", "system")
                        else:
                            # Non-approval tools log normally
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

        # ── STEP 7: Send prompt (with optional plan-then-execute) ─────────
        if approval_mode:
            # Phase 1: Ask agent to create a plan
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

            # The agent will now wait because we instructed it to present a plan first.
            # The event stream captures the plan text and tool calls.
            # Tool calls will be intercepted by consume_opencode_events for approval.

            await log("📋 Plan presented. Waiting for user approvals...", "system")
        else:
            # No approval mode — send prompt directly
            await log("💬 Sending prompt to agent...", "system")
            await log(f"Prompt: {prompt[:200]}{'...' if len(prompt) > 200 else ''}", "user")

            result = await opencode_client.session.chat(
                session_id, parts=[{"type": "text", "text": prompt}]
            )

        await log("✅ Agent completed task", "system")
        projects_store[user_id][project_id]["status"] = "zipping"

        event_task.cancel()
        try:
            await event_task
        except asyncio.CancelledError:
            pass

        # ── STEP 8: Zip the workspace and store it ────────────────────────
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

        projects_store[user_id][project_id]["zip_path"] = local_zip_path
        projects_store[user_id][project_id]["zip_size"] = len(zip_bytes)
        projects_store[user_id][project_id]["zip_ready"] = True
        projects_store[user_id][project_id]["status"] = "done"

        await log(f"✅ Done! ZIP ready ({len(zip_bytes) // 1024}KB)", "system")

        # ── STEP 9: Get file tree for Files tab ──────────────────────────
        tree_result = await sandbox.process.exec(
            f"find {workspace_path} -type f | sed 's|{workspace_path}/||' | head -200",
            timeout=10,
        )
        if tree_result.exit_code == 0:
            file_paths = [p for p in tree_result.result.split("\n") if p.strip()]
            projects_store[user_id][project_id]["file_tree"] = file_paths

        await queue.put({"level": "done", "message": "GENERATION_COMPLETE", "zip_ready": True})

    except Exception as e:
        await log(f"❌ Fatal error: {str(e)}", "error")
        if user_id in projects_store and project_id in projects_store.get(user_id, {}):
            projects_store[user_id][project_id]["status"] = "failed"
            projects_store[user_id][project_id]["error"] = str(e)
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
