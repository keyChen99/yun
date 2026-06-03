import asyncio
import re
import httpx
from fastapi import APIRouter, Request
from app.database import db_manager as db

router = APIRouter()

@router.get("/api/virtual_numbers")
async def get_virtual_numbers(search: str = None, page: int = 1, page_size: int = 20, has_mobile: bool = None, usage_count: int = None, cancellation_count: int = None, has_notes: bool = None):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.get_virtual_numbers_paginated, search, page, page_size, has_mobile, usage_count, cancellation_count, has_notes)

@router.post("/api/virtual_numbers/bulk")
async def add_virtual_numbers_bulk(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}
    
    items = []
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if not line: continue
        
        if "----" in line:
            parts = line.split("----")
            phone = parts[0].strip()
            link = parts[1].strip()
        elif " " in line:
            parts = line.split(None, 1)
            phone = parts[0].strip()
            link = parts[1].strip()
        else:
            phone_match = re.search(r'(\d{8,11})', line)
            link_match = re.search(r'(https?://[^\s]+)', line)
            if phone_match and link_match:
                phone = phone_match.group(1)
                link = link_match.group(1)
            else:
                continue
        
        items.append({
            "phone": phone,
            "link": link,
            "usage_count": 0,
            "notes": ""
        })
    
    if not items:
        return {"status": "error", "msg": "未识别到有效的号码和链接组合"}
    
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, db.save_virtual_numbers_bulk, items)
    return {"status": "success", "msg": f"成功保存 {count} 条虚拟号数据"}

@router.delete("/api/virtual_numbers/{item_id}")
async def delete_virtual_number(item_id: int):
    db.delete_virtual_number(item_id)
    return {"status": "success", "msg": "删除成功"}

@router.post("/api/virtual_numbers/{item_id}/increment")
async def increment_virtual_number_usage(item_id: int):
    db.increment_usage_count(item_id)
    return {"status": "success", "msg": "使用次数已更新"}

@router.post("/api/virtual_numbers/{item_id}/decrement")
async def decrement_virtual_number_usage(item_id: int):
    db.decrement_usage_count(item_id)
    return {"status": "success", "msg": "使用次数已更新"}

@router.get("/api/virtual_numbers/used_mobiles")
async def get_used_mobiles():
    loop = asyncio.get_event_loop()
    used_list = await loop.run_in_executor(None, db.get_used_mobile_numbers)
    return {"status": "success", "used": used_list}

@router.get("/api/mobile_library")
async def get_mobile_library():
    return db.get_mobile_library()

@router.post("/api/mobile_library")
async def add_mobile_to_library(request: Request):
    payload = await request.json()
    phone = payload.get("phone", "").strip()
    if not phone:
        return {"status": "error", "msg": "手机号不能为空"}
    success = db.add_to_mobile_library(phone)
    if success:
        return {"status": "success", "msg": "添加成功"}
    return {"status": "error", "msg": "添加失败，可能已存在"}

@router.delete("/api/mobile_library/{phone}")
async def delete_mobile_from_library(phone: str):
    db.delete_from_mobile_library(phone)
    return {"status": "success", "msg": "已从库中删除"}

@router.post("/api/mobile_library/{phone}/move_to_top")
async def move_mobile_to_top(phone: str):
    """置顶手机号，使其优先被分配"""
    db.move_mobile_to_top(phone)
    return {"status": "success", "msg": "已置顶，将优先分配"}

@router.get("/api/quick_copy_tools")
async def get_quick_copy_tools():
    return db.get_quick_copy_tools()

@router.post("/api/quick_copy_tools")
async def add_quick_copy_tool(request: Request):
    payload = await request.json()
    label = payload.get("label", "").strip()
    content = payload.get("content", "").strip()
    color = payload.get("color", "")
    bg_color = payload.get("bg_color", "")
    if not label or not content:
        return {"status": "error", "msg": "标签和内容不能为空"}
    db.add_quick_copy_tool(label, content, color, bg_color)
    return {"status": "success", "msg": "添加成功"}

@router.put("/api/quick_copy_tools/{tool_id}")
async def update_quick_copy_tool(tool_id: int, request: Request):
    payload = await request.json()
    label = payload.get("label", "").strip()
    content = payload.get("content", "").strip()
    color = payload.get("color", "")
    bg_color = payload.get("bg_color", "")
    if not label or not content:
        return {"status": "error", "msg": "标签和内容不能为空"}
    db.update_quick_copy_tool(tool_id, label, content, color, bg_color)
    return {"status": "success", "msg": "更新成功"}

@router.delete("/api/quick_copy_tools/{tool_id}")
async def delete_quick_copy_tool(tool_id: int):
    db.delete_quick_copy_tool(tool_id)
    return {"status": "success", "msg": "删除成功"}

@router.post("/api/virtual_numbers/{item_id}/cancellation/increment")
async def increment_virtual_number_cancellation(item_id: int):
    db.increment_cancellation_count(item_id)
    return {"status": "success", "msg": "注销次数已更新，手机号已自动清除"}

@router.post("/api/virtual_numbers/{item_id}/cancellation/decrement")
async def decrement_virtual_number_cancellation(item_id: int):
    db.decrement_cancellation_count(item_id)
    return {"status": "success", "msg": "注销次数已更新"}

@router.patch("/api/virtual_numbers/{item_id}/notes")
async def update_virtual_number_notes(item_id: int, request: Request):
    payload = await request.json()
    notes = payload.get("notes", "")
    db.update_virtual_number_notes(item_id, notes)
    return {"status": "success", "msg": "备注已更新"}

@router.patch("/api/virtual_numbers/{item_id}/mobile")
async def update_virtual_number_mobile(item_id: int, request: Request):
    payload = await request.json()
    mobile = payload.get("mobile", "")
    loop = asyncio.get_event_loop()
    deleted_count = await loop.run_in_executor(None, db.update_virtual_number_mobile, item_id, mobile)
    msg = "手机号已更新"
    if deleted_count > 0:
        msg = f"手机号已更新，并自动删除了 {deleted_count} 条重复旧项"
    return {"status": "success", "msg": msg, "deleted_count": deleted_count}

@router.patch("/api/virtual_numbers/{item_id}/machine_code")
async def update_virtual_number_machine_code(item_id: int, request: Request):
    payload = await request.json()
    machine_code = payload.get("machine_code", "")
    db.update_virtual_number_machine_code(item_id, machine_code)
    return {"status": "success", "msg": "机器码已更新"}

@router.patch("/api/virtual_numbers/{item_id}/sms")
async def update_virtual_number_sms(item_id: int, request: Request):
    payload = await request.json()
    sms_code = payload.get("sms_code", "")
    db.update_virtual_number_sms(item_id, sms_code)
    return {"status": "success", "msg": "验证码已同步"}

@router.post("/api/virtual_numbers/{item_id}/sms")
async def fetch_virtual_number_sms(item_id: int):
    """获取并解析验证码"""
    loop = asyncio.get_event_loop()
    record = await loop.run_in_executor(None, db.get_virtual_number, item_id)
    if not record or not record.get("link"):
        return {"status": "error", "msg": "未找到记录或链接为空"}
    
    url = record["link"]
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            content = resp.text.strip()
            
            # 提取验证码的逻辑
            # 1. 尝试匹配 4-6 位数字
            sms_match = re.search(r'(\d{6})', content)
            if sms_match:
                sms_code = sms_match.group(1)
            else:
                # 2. 如果没匹配到，取前 10 个字符（可能直接返回的就是验证码）
                sms_code = content[:10]
            
            # 更新数据库
            await loop.run_in_executor(None, db.update_virtual_number_sms, item_id, sms_code)
            
            return {
                "status": "success", 
                "sms_code": sms_code,
                "msg": f"获取成功: {sms_code}"
            }
    except Exception as e:
        return {"status": "error", "msg": f"获取失败: {str(e)}"}

@router.get("/api/virtual_numbers/proxy_fetch")
async def proxy_fetch_sms(url: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            return {"status": "success", "content": resp.text}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

@router.delete("/api/virtual_numbers/all/clear")
async def clear_all_virtual_numbers():
    db.clear_all_virtual_numbers()
    return {"status": "success", "msg": "所有虚拟号数据已清空"}

@router.post("/api/virtual_numbers/repair_links")
async def repair_virtual_numbers_links(request: Request):
    payload = await request.json()
    old_ip = payload.get("old_ip", "").strip()
    new_ip = payload.get("new_ip", "").strip()
    
    if not old_ip or not new_ip:
        return {"status": "error", "msg": "旧 IP 和新 IP 不能为空"}
        
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, db.repair_virtual_numbers_links, old_ip, new_ip)
    return {"status": "success", "msg": f"成功修复 {count} 条链接数据", "count": count}
