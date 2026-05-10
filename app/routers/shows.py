from fastapi import APIRouter, Request, HTTPException
from app.database import db_manager as db
from app.services.vision import parse_show_image
from datetime import datetime

router = APIRouter()

@router.get("/api/shows")
async def get_shows():
    return db.get_all_show_schedules()

@router.post("/api/shows")
async def add_show(request: Request):
    payload = await request.json()
    show_name = payload.get("show_name")
    sale_time = payload.get("sale_time")
    
    if not show_name or not sale_time:
        return {"status": "error", "msg": "名称和时间不能为空"}
    
    db.save_show_schedule(show_name, sale_time)
    return {"status": "success", "msg": "添加成功"}

@router.post("/api/shows/bulk")
async def add_shows_bulk(request: Request):
    payload = await request.json()
    items = payload.get("items", [])
    if not items:
        return {"status": "error", "msg": "数据为空"}
    
    count = db.save_shows_bulk(items)
    return {"status": "success", "msg": f"成功保存 {count} 条演出日程"}

@router.put("/api/shows/{item_id}")
async def update_show(item_id: int, request: Request):
    payload = await request.json()
    show_name = payload.get("show_name")
    sale_time = payload.get("sale_time")
    
    db.update_show_schedule(item_id, show_name, sale_time)
    return {"status": "success", "msg": "更新成功"}

@router.delete("/api/shows/{item_id}")
async def delete_show(item_id: int):
    db.delete_show_schedule(item_id)
    return {"status": "success", "msg": "删除成功"}

@router.post("/api/shows/parse_image")
async def parse_image(request: Request):
    payload = await request.json()
    image_base64 = payload.get("image")
    
    if not image_base64:
        return {"status": "error", "msg": "图片不能为空"}
    
    data_list = await parse_show_image(image_base64)
    if data_list and isinstance(data_list, list):
        return {"status": "success", "data": data_list}
    else:
        return {"status": "error", "msg": "AI 未能识别到有效的演出日程，请手动输入"}
