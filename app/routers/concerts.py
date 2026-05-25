import json
import re
from datetime import datetime
from app.core.config import get_now_cst
from fastapi import APIRouter, Request
from app.database import db_manager as db
from app.core.sse import notify_clients

router = APIRouter()

def find_key_recursive(data, target_key):
    """递归查找字典中的键"""
    if isinstance(data, dict):
        if target_key in data:
            return data[target_key]
        for v in data.values():
            result = find_key_recursive(v, target_key)
            if result is not None:
                return result
    elif isinstance(data, list):
        for item in data:
            result = find_key_recursive(item, target_key)
            if result is not None:
                return result
    return None

@router.post("/receive")
async def receive_data(request: Request):
    try:
        send_data = await request.json()
        # 打印简短日志，方便追踪
        url_path = ""
        if "request" in send_data and "url" in send_data["request"]:
            url_full = send_data["request"]["url"]
            url_path = url_full.split("?")[0].split("/")[-1]
            print(f"收到接口数据: {url_path}")

        body = None
        if "response" in send_data:
            resp_obj = send_data["response"]
            body = resp_obj.get("body")
        
        if not body and "body" in send_data:
            body = send_data["body"]

        if not body:
            return {"status": "ignored", "msg": "未发现 body 数据"}
            
        concert_data = None
        if isinstance(body, str):
            if not body.strip():
                return {"status": "ignored", "msg": "body 为空"}
            try:
                concert_data = json.loads(body)
            except Exception:
                return {"status": "error", "msg": "JSON 解析失败"}
        else:
            concert_data = body
            
        if not isinstance(concert_data, dict):
            print(f"错误: 数据格式错误, 类型为 {type(concert_data)}")
            return {"status": "error", "msg": f"数据格式错误: {type(concert_data)}"}

        # 1. 尝试获取演出名称
        # 优先级：直接读取 > 递归搜索 > URL参数
        product_name = (
            concert_data.get("product_name") or 
            (concert_data.get("data", {}) if isinstance(concert_data.get("data"), dict) else {}).get("product_name") or
            find_key_recursive(concert_data, "product_name") or
            find_key_recursive(concert_data, "itemName") or
            find_key_recursive(concert_data, "title") or
            find_key_recursive(concert_data, "projectName") or
            find_key_recursive(concert_data, "showName")
        )
        
        # 如果还是没有，尝试从 URL 中解析
        if not product_name and "request" in send_data:
            url = send_data["request"].get("url", "")
            # 尝试从 URL 参数中寻找可能的名字或 ID
            import urllib.parse
            parsed_url = urllib.parse.urlparse(url)
            params = urllib.parse.parse_qs(parsed_url.query)
            if "itemName" in params:
                product_name = params["itemName"][0]
            elif "itemId" in params:
                product_name = f"演出ID_{params['itemId'][0]}"
            elif "id" in params:
                product_name = f"演出ID_{params['id'][0]}"

        # 2. 尝试获取库存数据
        calendar_map = (
            concert_data.get("show_sku_calendar_infos_map") or 
            (concert_data.get("data", {}) if isinstance(concert_data.get("data"), dict) else {}).get("show_sku_calendar_infos_map") or
            find_key_recursive(concert_data, "show_sku_calendar_infos_map") or
            find_key_recursive(concert_data, "sku_calendar")
        )

        # 自动扫描逻辑
        if calendar_map is None:
            # 在整个字典中找看起来像库存的东西
            def look_for_stock(d):
                if not isinstance(d, dict): return None
                for k, v in d.items():
                    if isinstance(v, dict) and ("calendar" in k.lower() or "sku" in k.lower()) and len(v) > 0:
                        return v
                    res = look_for_stock(v)
                    if res: return res
                return None
            calendar_map = look_for_stock(concert_data)

        # 最后的兜底检查
        if not product_name:
            # 如果有库存但没名字，给个默认名，防止完全无法保存
            if calendar_map:
                product_name = f"未知演出_{get_now_cst().strftime('%H%M%S')}"
            else:
                # 记录详细日志，看看结构到底长什么样
                import logging
                logging.error(f"无法识别名称且无库存。接口: {url_path}, 数据结构摘要: {str(concert_data)[:500]}")
                return {"status": "error", "msg": "缺少演出名称且无库存"}

        if calendar_map is None:
            # 如果没抓到库存，但是已经识别出了名称，可能这个报文只是个状态报文，或者是名称报文
            # 为了防止报错，我们记录一下日志但返回 success
            print(f"收到状态报文(无库存数据)。接口: {url_path}, 演出: {product_name}")
            return {"status": "ignored", "msg": "该报文不含库存数据"}

        all_dates = sorted(list(calendar_map.keys()))
        
        concert_info = {
            "name": product_name,
            "dates": all_dates,
            "stock_map": calendar_map,
            "fetch_time": get_now_cst().strftime("%m-%d %H:%M:%S")
        }
        
        print(f"成功解析并保存: {product_name} ({len(all_dates)}个日期)")
        db.save_concert(concert_info)
        await notify_clients("concert_update")
            
        return {"status": "success", "msg": "保存成功"}

    except Exception as e:
        print(f"处理异常: {str(e)}")
        return {"status": "error", "msg": str(e)}

@router.get("/api/data")
async def get_concert_data():
    return db.get_all_concerts()

@router.delete("/api/data/{item_id}")
async def delete_concert_data(item_id: int):
    try:
        db.delete_concert(item_id)
        await notify_clients("concert_update")
        return {"status": "success", "msg": "删除成功"}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
