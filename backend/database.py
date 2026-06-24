import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB_NAME", "opencode_mobile")

client: AsyncIOMotorClient = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]

    # Create indexes
    await db.projects.create_index([("user_id", 1), ("created_at", -1)])
    await db.projects.create_index("project_id", unique=True)
    await db.settings.create_index("user_id", unique=True)
    await db.messages.create_index([("project_id", 1), ("created_at", 1)])

    print(f"Connected to MongoDB: {DB_NAME}")


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db


# ── Projects ─────────────────────────────────────────────────────────────────

async def insert_project(user_id: str, project: dict):
    project["user_id"] = user_id
    await db.projects.insert_one(project)


async def get_project(user_id: str, project_id: str) -> dict | None:
    return await db.projects.find_one(
        {"user_id": user_id, "project_id": project_id},
        {"_id": 0},
    )


async def list_projects(user_id: str) -> list[dict]:
    cursor = db.projects.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=100)


async def update_project(user_id: str, project_id: str, update: dict):
    await db.projects.update_one(
        {"user_id": user_id, "project_id": project_id},
        {"$set": update},
    )


async def delete_project(user_id: str, project_id: str):
    await db.projects.delete_one({"user_id": user_id, "project_id": project_id})


# ── Settings ─────────────────────────────────────────────────────────────────

async def get_settings(user_id: str) -> dict:
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        return {"user_id": user_id, "mcp_servers": [], "llm_providers": []}
    return settings


async def update_settings(user_id: str, update: dict):
    await db.settings.update_one(
        {"user_id": user_id},
        {"$set": update},
        upsert=True,
    )


# ── Messages ─────────────────────────────────────────────────────────────────

async def insert_message(project_id: str, message: dict):
    message["project_id"] = project_id
    await db.messages.insert_one(message)


async def get_messages(project_id: str) -> list[dict]:
    cursor = db.messages.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1)
    return await cursor.to_list(length=500)


# ── Logs ─────────────────────────────────────────────────────────────────────

async def insert_log(project_id: str, log: dict):
    log["project_id"] = project_id
    await db.logs.insert_one(log)


async def get_logs(project_id: str) -> list[dict]:
    cursor = db.logs.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1)
    return await cursor.to_list(length=1000)
