import asyncio
import json

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class InstallSkillRequest(BaseModel):
    command: str
    project_id: str


class AddMcpRequest(BaseModel):
    name: str
    url: str
    config: dict = {}


class AddLlmRequest(BaseModel):
    provider_name: str
    base_url: str
    api_key: str
    model: str
    is_default: bool = False


class TestLlmRequest(BaseModel):
    base_url: str
    api_key: str
    model: str


@router.post("/skills/install")
async def install_skill(body: InstallSkillRequest, user: dict = CurrentUser):
    from main import log_queues, sandboxes_store

    sandbox = sandboxes_store.get(body.project_id)
    if not sandbox:
        raise HTTPException(status_code=400, detail="No active sandbox for this project")

    # Validate command
    cmd = body.command.strip()
    dangerous = ["rm ", "curl | bash", "| sh", "| bash"]
    if any(d in cmd for d in dangerous) and "opencode.ai/install" not in cmd:
        raise HTTPException(status_code=400, detail="Potentially dangerous command rejected")

    try:
        result = await sandbox.process.exec(cmd, timeout=60)
        output = result.result or ""

        # Stream output to log queue
        queue = log_queues.get(body.project_id)
        if queue:
            for line in output.split("\n"):
                if line.strip():
                    await queue.put({"level": "system", "message": line})

        return {"exit_code": result.exit_code, "output": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mcp/add")
async def add_mcp_server(body: AddMcpRequest, user: dict = CurrentUser):
    from main import settings_store

    user_id = user["user_id"]
    if user_id not in settings_store:
        settings_store[user_id] = {"mcp_servers": [], "llm_providers": []}

    settings_store[user_id]["mcp_servers"] = [
        s for s in settings_store[user_id]["mcp_servers"] if s["name"] != body.name
    ]
    settings_store[user_id]["mcp_servers"].append(
        {"name": body.name, "url": body.url, "config": body.config, "status": "unknown"}
    )

    return {"status": "added"}


@router.get("/mcp/list")
async def list_mcp_servers(user: dict = CurrentUser):
    from main import settings_store

    user_id = user["user_id"]
    servers = settings_store.get(user_id, {}).get("mcp_servers", [])
    return {"servers": servers}


@router.delete("/mcp/{name}")
async def delete_mcp_server(name: str, user: dict = CurrentUser):
    from main import settings_store

    user_id = user["user_id"]
    if user_id in settings_store:
        settings_store[user_id]["mcp_servers"] = [
            s for s in settings_store[user_id]["mcp_servers"] if s["name"] != name
        ]
    return {"status": "deleted"}


@router.post("/llm/add")
async def add_llm_provider(body: AddLlmRequest, user: dict = CurrentUser):
    from main import settings_store

    user_id = user["user_id"]
    if user_id not in settings_store:
        settings_store[user_id] = {"mcp_servers": [], "llm_providers": []}

    # If setting as default, unset other defaults
    if body.is_default:
        for p in settings_store[user_id]["llm_providers"]:
            p["is_default"] = False

    # Remove existing provider with same name
    settings_store[user_id]["llm_providers"] = [
        p for p in settings_store[user_id]["llm_providers"] if p["provider_name"] != body.provider_name
    ]

    settings_store[user_id]["llm_providers"].append(body.model_dump())
    return {"status": "saved"}


@router.get("/llm/list")
async def list_llm_providers(user: dict = CurrentUser):
    from main import settings_store

    user_id = user["user_id"]
    providers = settings_store.get(user_id, {}).get("llm_providers", [])
    return {"providers": providers}


@router.post("/llm/test")
async def test_llm_provider(body: TestLlmRequest, user: dict = CurrentUser):
    import httpx
    import time

    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{body.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {body.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": body.model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                },
            )
            elapsed = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return {"ok": True, "latency_ms": elapsed, "error": None}
            else:
                return {"ok": False, "latency_ms": elapsed, "error": resp.text[:200]}
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return {"ok": False, "latency_ms": elapsed, "error": str(e)}
