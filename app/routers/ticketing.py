import asyncio
from fastapi import APIRouter, Request, HTTPException
from app.database import db_manager as db
from app.services.ai import ai_parse_tickets
from app.services.parser import local_advanced_parse

router = APIRouter()

@router.post("/api/ai/parse")
async def api_ai_parse(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "输入内容为空"}
    return await ai_parse_tickets(text)

@router.post("/api/local/parse")
async def api_local_parse(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}
    try:
        data = local_advanced_parse(text)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

@router.get("/api/tickets_sys")
async def get_tickets_sys(search: str = None, show_name: str = None, viewer: str = None, status: str = None):
    return db.get_all_tickets_sys(search, show_name, viewer, status)

@router.post("/api/tickets_sys")
async def add_ticket_sys(request: Request):
    payload = await request.json()
    show_name = payload.get("show_name")
    show_date = payload.get("show_date", "")
    viewers = payload.get("viewers")
    quantity = payload.get("quantity", 1)
    price = payload.get("price")
    notes = payload.get("notes")
    status = payload.get("status", "待抢")
    config_code = payload.get("config_code", "")
    
    db.save_ticket_sys(show_name, viewers, quantity, price, notes, show_date, status, config_code)
    return {"status": "success", "msg": "保存成功"}

@router.post("/api/tickets_sys/bulk")
async def add_tickets_bulk(request: Request):
    payload = await request.json()
    items = payload.get("items", [])
    if not items:
        return {"status": "error", "msg": "数据为空"}
    
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, db.save_tickets_bulk, items)
    return {"status": "success", "msg": f"成功保存 {count} 条数据"}

@router.put("/api/tickets_sys/{ticket_id}")
async def update_ticket_sys(ticket_id: int, request: Request):
    payload = await request.json()
    show_name = payload.get("show_name")
    show_date = payload.get("show_date", "")
    viewers = payload.get("viewers")
    quantity = payload.get("quantity")
    price = payload.get("price")
    notes = payload.get("notes")
    status = payload.get("status")
    config_code = payload.get("config_code", "")
    
    db.update_ticket_sys(ticket_id, show_name, show_date, viewers, quantity, price, notes, status, config_code)
    return {"status": "success", "msg": "更新成功"}

@router.patch("/api/tickets_sys/{ticket_id}/status")
async def update_ticket_status(ticket_id: int, request: Request):
    payload = await request.json()
    status = payload.get("status")
    db.update_ticket_status(ticket_id, status)
    return {"status": "success", "msg": "状态更新成功"}

@router.delete("/api/tickets_sys/{ticket_id}")
async def delete_ticket_sys(ticket_id: int):
    db.delete_ticket_sys(ticket_id)
    return {"status": "success", "msg": "删除成功"}

@router.post("/api/tickets_sys/bulk_delete")
async def delete_tickets_bulk(request: Request):
    payload = await request.json()
    ticket_ids = payload.get("ids", [])
    if not ticket_ids:
        return {"status": "error", "msg": "未选择要删除的数据"}
    
    count = db.delete_tickets_bulk(ticket_ids)
    return {"status": "success", "msg": f"成功删除 {count} 条记录"}

@router.delete("/api/tickets_sys/all/clear")
async def clear_all_tickets():
    db.clear_all_tickets_sys()
    return {"status": "success", "msg": "所有票务数据已清空"}
