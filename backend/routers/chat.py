import asyncio

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SendMessageRequest(BaseModel):
    text: str


@router.post("/{project_id}/message")
async def send_message(project_id: str, body: SendMessageRequest, user: dict = CurrentUser):
    from opencode_ai import AsyncOpencode

    from main import log_queues, projects_store, sandboxes_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session_id = project.get("session_id")
    sandbox = sandboxes_store.get(project_id)
    if not session_id or not sandbox:
        raise HTTPException(status_code=400, detail="Project has no active sandbox")

    sandbox_base_url = await sandbox.get_preview_url(54321)
    opencode_client = AsyncOpencode(base_url=sandbox_base_url)

    queue = log_queues.setdefault(project_id, asyncio.Queue())

    async def log(msg: str, level: str = "info"):
        await queue.put({"level": level, "message": msg})

    try:
        await log(f"💬 User: {body.text[:200]}", "user")

        async def consume_events():
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
                        await log(f"🔧 Tool: {tool_name} — {str(tool_input)[:120]}", "tool")
                    elif event_type == "session.error":
                        error_msg = event_dict.get("error", {}).get("message", "Unknown error")
                        await log(f"❌ Error: {error_msg}", "error")
            except Exception as e:
                await log(f"Event stream ended: {e}", "system")

        event_task = asyncio.create_task(consume_events())

        await opencode_client.session.chat(
            session_id, parts=[{"type": "text", "text": body.text}]
        )

        event_task.cancel()
        try:
            await event_task
        except asyncio.CancelledError:
            pass

        await log("✅ Response complete", "system")
        return {"status": "sent"}

    except Exception as e:
        await log(f"❌ Error: {str(e)}", "error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/messages")
async def get_messages(project_id: str, user: dict = CurrentUser):
    from opencode_ai import AsyncOpencode

    from main import projects_store, sandboxes_store

    user_id = user["user_id"]
    project = projects_store.get(user_id, {}).get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session_id = project.get("session_id")
    sandbox = sandboxes_store.get(project_id)
    if not session_id or not sandbox:
        return {"messages": []}

    try:
        sandbox_base_url = await sandbox.get_preview_url(54321)
        opencode_client = AsyncOpencode(base_url=sandbox_base_url)
        messages = await opencode_client.session.messages(session_id)

        formatted = []
        for msg in messages:
            msg_dict = msg.to_dict() if hasattr(msg, "to_dict") else vars(msg)
            formatted.append({
                "id": msg_dict.get("id", ""),
                "role": msg_dict.get("role", "user"),
                "content": msg_dict.get("content", ""),
                "timestamp": msg_dict.get("created_at", ""),
            })

        return {"messages": formatted}
    except Exception:
        return {"messages": []}
