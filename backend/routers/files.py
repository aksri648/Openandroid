import os

from auth import CurrentUser
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from database import get_project

router = APIRouter()


@router.get("/{project_id}/tree")
async def get_file_tree(project_id: str, user: dict = CurrentUser):
    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"files": project.get("file_tree", [])}


@router.get("/{project_id}/content")
async def get_file_content(project_id: str, path: str, user: dict = CurrentUser):
    from main import sandboxes_store

    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sandbox = sandboxes_store.get(project_id)
    if not sandbox:
        raise HTTPException(status_code=400, detail="Sandbox not running")

    try:
        full_path = f"/home/daytona/workspace/{path}"
        content_bytes = await sandbox.fs.download_file(full_path)
        return {"content": content_bytes.decode("utf-8", errors="replace"), "path": path}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not read file: {e}")


@router.get("/{project_id}/download")
async def download_project(project_id: str, user: dict = CurrentUser):
    project = await get_project(user["user_id"], project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    zip_path = project.get("zip_path")
    if not zip_path or not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="ZIP not ready yet")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{project.get('name', 'project')}.zip",
    )
