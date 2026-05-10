import json
import asyncio
import re
from fastapi import APIRouter, Request
from app.database import db_manager as db
from app.utils.helpers import extract_machine_code

router = APIRouter()

@router.post("/api/rpa/claim")
async def rpa_claim_number(request: Request):
    """
    供影刀/RPA调用：获取一个可用号码并自动绑定机器码
    优化：支持从 (1062694)-Taoxin 格式中提取机器码
    """
    try:
        payload = await request.json()
        raw_machine_code = payload.get("machine_code") or payload.get("machine_codes")
    except Exception:
        # 兼容非标准 JSON 或文本输入
        body = await request.body()
        body_str = body.decode('utf-8', errors='ignore')
        match = re.search(r'machine_codes?["\']?\s*[:=]\s*["\']?([^"\'\s,{}]+)["\']?', body_str)
        raw_machine_code = match.group(1) if match else ""

    if not raw_machine_code:
        return {"status": "error", "msg": "必须提供 machine_code 字段"}
    
    # 提取纯数字机器码
    machine_code = extract_machine_code(raw_machine_code)
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, db.claim_virtual_number, machine_code)
    
    if result:
        return {
            "status": "success",
            "data": result,
            "msg": f"已成功为 {machine_code} 分配号码"
        }
    return {"status": "error", "msg": "没有可用号码"}

@router.post("/api/rpa/cancel")
async def rpa_cancel_number(request: Request):
    """
    注销接口：根据机器码找到对应项，注销次数+1，删除机器码和手机号
    """
    try:
        payload = await request.json()
        raw_machine_code = payload.get("machine_code") or payload.get("machine_codes")
    except Exception:
        return {"status": "error", "msg": "解析请求失败"}

    if not raw_machine_code:
        return {"status": "error", "msg": "必须提供 machine_code 字段"}

    machine_code = extract_machine_code(raw_machine_code)
    
    loop = asyncio.get_event_loop()
    # 1. 查找记录
    record = await loop.run_in_executor(None, db.get_vn_by_machine_code, machine_code)
    if not record:
        return {"status": "error", "msg": f"未找到绑定机器码 {machine_code} 的记录"}
    
    # 2. 检查是否存在备注，如果存在则不注销
    if record.get("notes") and record["notes"].strip():
        return {
            "status": "skipped", 
            "msg": f"机器码 {machine_code} 存在备注，已跳过自动注销",
            "notes": record["notes"]
        }
    
    # 3. 执行注销逻辑 (increment_cancellation_count 已包含清除手机号和机器码的逻辑)
    await loop.run_in_executor(None, db.increment_cancellation_count, record["id"])
    
    return {"status": "success", "msg": f"机器码 {machine_code} 已注销"}

@router.post("/api/rpa/get_mobile")
async def rpa_get_mobile(request: Request):
    """
    获取手机号接口：根据机器码找到对应项，分配可用手机号 (优酷优先)
    """
    try:
        payload = await request.json()
        raw_machine_code = payload.get("machine_code") or payload.get("machine_codes")
    except Exception:
        return {"status": "error", "msg": "解析请求失败"}

    if not raw_machine_code:
        return {"status": "error", "msg": "必须提供 machine_code 字段"}

    machine_code = extract_machine_code(raw_machine_code)
    
    loop = asyncio.get_event_loop()
    # 1. 查找记录
    record = await loop.run_in_executor(None, db.get_vn_by_machine_code, machine_code)
    if not record:
        return {"status": "error", "msg": f"未找到绑定机器码 {machine_code} 的记录，请先调用 claim 接口"}
    
    # 2. 分配手机号
    result = await loop.run_in_executor(None, db.assign_mobile_by_priority, record["id"], machine_code)
    
    if result:
        return {
            "status": "success",
            "data": {
                "mobile_type": result["type"],
                "mobile": result["phone"]
            },
            "msg": f"已为机器码 {machine_code} 分配手机号: {result['type']}-{result['phone']}"
        }
    return {"status": "error", "msg": "手机号库已用完"}
