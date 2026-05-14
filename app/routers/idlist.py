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
    
    # 1. 尝试从文本中直接提取标题（通常在 URL 之前或之后）
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if not line: continue
        # 如果包含 URL，尝试取 URL 之前的文字
        if "http" in line:
            parts = re.split(r"https?://", line)
            if parts[0].strip():
                potential_title = parts[0].strip()
                # 过滤掉一些明显的非标题文字
                if len(potential_title) > 2 and len(potential_title) < 100:
                    title = potential_title
                    break
        # 如果某一行看起来像标题（较短且不全是数字/ID）
        elif 2 < len(line) < 50 and not re.search(r"\d{10,}", line):
            title = line
            break

    # 2. 如果文本提取失败，尝试爬虫获取
    if url and title == "未知演出":
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

@router.delete("/api/idlist/{item_id}")
async def delete_id_group(item_id: str):
    db.delete_id_project(item_id)
    return {"status": "success", "msg": "删除成功"}

@router.patch("/api/idlist/{item_id}/title")
async def update_id_title(item_id: str, request: Request):
    payload = await request.json()
    title = payload.get("title")
    if not title:
        return {"status": "error", "msg": "标题不能为空"}
    db.update_id_project_title(item_id, title)
    return {"status": "success", "msg": "更新成功"}

@router.post("/api/idlist/clear_expired")
async def clear_expired_idlist():
    projects_count, tickets_count = db.clear_expired_id_projects()
    return {
        "status": "success", 
        "msg": f"已成功清除 {projects_count} 个过期项目和 {tickets_count} 条过期票价数据",
        "projects_count": projects_count,
        "tickets_count": tickets_count
    }
