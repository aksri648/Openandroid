import asyncio
from datetime import datetime, timezone

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_project, insert_message, get_messages

router = APIRouter()


class SendMessageRequest(BaseModel):
    text: str


@router.post("/{project_id}/message")
async def send_message(project_id: str, body: SendMessageRequest, user: dict = CurrentUser):
    from opencode_ai import AsyncOpencode

    from main import log_queues, sandboxes_store

    user_id = user["user_id"]
    project = await get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session_id = project.get("session_id")
    sandbox = sandboxes_store.get(project_id)
    if not session_id or not sandbox:
        raise HTTPException(status_code=400, detail="Project has no active sandbox")

    # Save user message to MongoDB
    await insert_message(project_id, {
        "role": "user",
        "content": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

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
                                # Save agent message to MongoDB
                                await insert_message(project_id, {
                                    "role": "assistant",
                                    "content": text,
                                    "created_at": datetime.now(timezone.utc).isoformat(),
                                })
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
async def get_messages_endpoint(project_id: str, user: dict = CurrentUser):
    user_id = user["user_id"]
    project = await get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    messages = await get_messages(project_id)
    return {"messages": messages}
