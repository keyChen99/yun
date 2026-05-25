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

@router.delete("/api/wechat/{item_id}")
async def delete_wechat_item(item_id: int):
    db.delete_wechat(item_id)
    return {"status": "success", "msg": "删除成功"}
