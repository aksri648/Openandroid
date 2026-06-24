import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/logs/{project_id}")
async def websocket_logs(websocket: WebSocket, project_id: str):
    """
    WebSocket endpoint that streams log lines for a specific project.
    The frontend connects here immediately after creating a project.
    Token is passed as query param: ws://host/ws/logs/{project_id}?token=xxx
    """
    await websocket.accept()

    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    from main import log_queues

    if project_id not in log_queues:
        log_queues[project_id] = asyncio.Queue()

    queue = log_queues[project_id]

    try:
        while True:
            try:
                log_line = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps(log_line))

                if log_line.get("message") == "GENERATION_COMPLETE":
                    await asyncio.sleep(0.5)
                    break

            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"level": "ping", "message": ""}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"level": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        await websocket.close()
