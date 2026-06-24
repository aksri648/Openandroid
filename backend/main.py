import asyncio
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, files, projects, settings, ws

load_dotenv()

app = FastAPI(title="OpenCode Mobile Cloud API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

# ── In-memory stores ────────────────────────────────────────────────────────
# Keyed by user_id, then project_id
projects_store: Dict[str, Dict[str, Any]] = {}
# Structure: { user_id: { project_id: { id, name, status, sandbox_id, session_id, created_at, zip_path } } }

sandboxes_store: Dict[str, Any] = {}
# Structure: { project_id: <Daytona Sandbox object> }

log_queues: Dict[str, asyncio.Queue] = {}
# Structure: { project_id: asyncio.Queue of log line dicts }

settings_store: Dict[str, Any] = {}
# Structure: { user_id: { mcp_servers: [...], llm_providers: [...] } }

# ── Approval system ─────────────────────────────────────────────────────────
# Structure: { project_id: { "event": asyncio.Event, "approved": bool, "actions": [...] } }
approval_store: Dict[str, Dict[str, Any]] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True,
    )
