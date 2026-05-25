from datetime import datetime
from app.core.config import get_now_cst
from fastapi import APIRouter, Request
from app.database import db_manager as db
from app.core.sse import notify_clients
from app.services.parser import split_viewer_blocks, parse_viewer_block

router = APIRouter()

@router.get("/api/viewers")
async def get_viewers():
    return db.get_all_viewers()

@router.post("/api/viewers/parse")
async def parse_and_save_viewers(request: Request):
    payload = await request.json()
    text = payload.get("text", "")

    blocks = split_viewer_blocks(text)
    extracted = []
    for block in blocks:
        parsed = parse_viewer_block(block)
        if parsed:
            extracted.append(parsed)
            continue

        if extracted:
            extra_desc = "\n".join(line.strip() for line in block.splitlines() if line.strip())[:200]
            if extra_desc:
                previous_desc = extracted[-1].get("desc", "")
                extracted[-1]["desc"] = f"{previous_desc}\n{extra_desc}".strip()[:200]

    if not extracted:
        return {"status": "success", "added": 0, "items": []}

    existing = db.get_all_viewers()
    existing_by_key = {item["group_key"]: item for item in existing}

    added = 0
    now_str = get_now_cst().strftime("%m-%d %H:%M:%S")
    to_save = []
    
    for item in extracted:
        group_key = item["group_key"]
        existing_item = existing_by_key.get(group_key)
        if existing_item:
            existing_item["desc" ] = item.get("desc", "") or existing_item.get("desc", "")
            for idx, member in enumerate(item.get("members", [])):
                if idx >= len(existing_item["members"]):
                    existing_item["members"].append(member)
                    continue
                if member.get("name"):
                    existing_item["members"][idx]["name"] = member["name"]
            to_save.append(existing_item)
        else:
            new_item = {
                "group_key": group_key,
                "members": item.get("members", []),
                "desc": item.get("desc", ""),
                "added_time": now_str,
            }
            to_save.append(new_item)
            added += 1

    db.save_viewers_batch(to_save)
    await notify_clients("viewer_update")

    return {"status": "success", "added": added, "items": extracted}

@router.delete("/api/viewers/{group_key}")
async def delete_viewer(group_key: str):
    db.delete_viewer(group_key)
    await notify_clients("viewer_update")
    return {"status": "success", "msg": "删除成功"}

@router.delete("/api/viewers")
async def clear_viewers():
    db.clear_viewers()
    await notify_clients("viewer_update")
    return {"status": "success", "msg": "已清空"}
