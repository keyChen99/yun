import asyncio
from fastapi import APIRouter, Request
from app.database import db_manager as db

router = APIRouter()

@router.get("/api/wechat")
async def get_wechat_list(search: str = None, status: int = None, tag: str = None):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.get_all_wechat, search, status, tag)

@router.post("/api/wechat/bulk")
async def add_wechat_bulk(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    inputter = payload.get("inputter", "")
    
    if not text:
        return {"status": "error", "msg": "微信内容不能为空"}
    
    # 解析文本中的微信 ID，支持逗号、空格、换行分隔
    import re
    wechat_ids = re.split(r'[,\s\n]+', text)
    wechat_ids = [wid.strip() for wid in wechat_ids if wid.strip()]
    
    if not wechat_ids:
        return {"status": "error", "msg": "未识别到有效的微信ID"}
    
    loop = asyncio.get_event_loop()
    valid_count, duplicate_count = await loop.run_in_executor(None, db.save_wechat_bulk, wechat_ids, inputter)
    
    return {
        "status": "success", 
        "msg": f"新增完成。有效数据: {valid_count}, 重复数量: {duplicate_count}",
        "valid_count": valid_count,
        "duplicate_count": duplicate_count
    }

@router.put("/api/wechat/{item_id}")
async def update_wechat_item(item_id: int, request: Request):
    payload = await request.json()
    is_processed = payload.get("is_processed")
    tag = payload.get("tag")
    
    db.update_wechat(item_id, is_processed, tag)
    return {"status": "success", "msg": "更新成功"}

@router.get("/api/wechat/stats/today")
async def get_today_stats():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.get_wechat_stats_today)

@router.post("/api/wechat/visit")
async def log_visit(request: Request):
    payload = await request.json()
    role = payload.get("role", "guest")
    inputter = payload.get("inputter", "")
    
    # 获取客户端 IP
    client_ip = request.client.host
    user_agent = request.headers.get("user-agent", "")
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, db.record_wechat_visit, client_ip, user_agent, role, inputter)
    return {"status": "success"}

@router.get("/api/wechat/logs")
async def get_logs(request: Request):
    # 强制校验 token 必须是超级管理员
    auth_token = request.headers.get("Authorization")
    from app.core.config import AUTH_PASSWORD
    if auth_token != AUTH_PASSWORD:
        return {"status": "error", "msg": "无权查看日志"}
        
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.get_visit_logs)

@router.delete("/api/wechat/{item_id}")
async def delete_wechat_item(item_id: int):
    db.delete_wechat(item_id)
    return {"status": "success", "msg": "删除成功"}
