import re
from fastapi import APIRouter, Request
from app.database import db_manager as db
from app.services.crawler import fetch_damai_title

router = APIRouter()

@router.post("/api/idlist/parse")
async def parse_id_list(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}

    url_match = re.search(r"https?://[^\s]+", text)
    url = url_match.group(0) if url_match else ""
    
    title = "未知演出"
    if url:
        title = await fetch_damai_title(url)

    lines = text.splitlines()
    parsed_items = []
    
    item_id = ""
    if url:
        item_id_match = re.search(r"itemId=(\d+)", url)
        if item_id_match:
            item_id = item_id_match.group(1)

    for line in lines:
        line = line.strip()
        if not line: continue
        
        match = re.search(r"(.*?)\s+(\d+)\s+(\d+)$", line)
        if match:
            info = match.group(1).strip()
            p_id = match.group(2).strip()
            t_id = match.group(3).strip()
            
            if not item_id: item_id = p_id
            
            parsed_items.append({
                "ticketId": t_id,
                "info": info
            })

    if not item_id or not parsed_items:
        return {"status": "error", "msg": "未识别到有效的项目ID或票价ID"}

    db.save_id_project(item_id, title, url, parsed_items)

    return {"status": "success", "msg": "解析成功"}

@router.get("/api/idlist")
async def get_id_list():
    return db.get_id_projects()

@router.get("/api/idlist/{item_id}")
async def delete_id_group(item_id: str):
    db.delete_id_project(item_id)
    return {"status": "success", "msg": "删除成功"}
