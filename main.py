from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import json
import os
import asyncio
import re
import httpx
import uvicorn
from playwright.async_api import async_playwright
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
import db_manager as db

# 初始化FastAPI应用
app = FastAPI()

# 初始化数据库
db.init_ticketing_db()
db.init_virtual_numbers_db()
db.init_known_patterns_db()

# 授权密码
AUTH_PASSWORD = "248248"

def is_local_ip(ip: str) -> bool:
    return ip in ["127.0.0.1", "localhost", "::1"]

@app.post("/api/auth")
async def check_auth(request: Request):
    payload = await request.json()
    password = payload.get("password")
    if password == AUTH_PASSWORD:
        return {"status": "success"}
    return {"status": "error", "msg": "密码错误"}

# 用于管理 SSE 连接的客户端队列
clients: Set[asyncio.Queue] = set()

# 解决跨域问题（前端本地访问必备）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 Vite 构建的静态资源
if os.path.exists("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

ID_PATTERN = r"[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]"
PAIR_RE = re.compile(rf"([\u4e00-\u9fa5]{{2,8}})\s*({ID_PATTERN})")
REVERSE_PAIR_RE = re.compile(rf"({ID_PATTERN})\s*([\u4e00-\u9fa5]{{2,8}})")
NAME_LABEL_RE = re.compile(r"^(?:姓名|名字)\s*[:：]\s*([\u4e00-\u9fa5]{2,8})\s*$")
ID_LABEL_RE = re.compile(r"^(?:身份证|身份证号)\s*[:：]\s*(" + ID_PATTERN + r")\s*$")
PURE_NAME_RE = re.compile(r"^[\u4e00-\u9fa5]{2,8}$")
PURE_ID_RE = re.compile(r"^" + ID_PATTERN + r"$")
SEPARATOR_LINE_RE = re.compile(r"^[\-—_=~\u2500-\u257f\u23af\u30fc\uFF0D]{3,}$")


def build_group_key(members: List[Dict[str, str]]) -> str:
    return "|".join(member["id_number"] for member in members if member.get("id_number"))


def normalize_viewer_group(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    members = item.get("members")
    normalized_members: List[Dict[str, str]] = []

    if isinstance(members, list):
        for member in members:
            if not isinstance(member, dict):
                continue
            id_number = str(member.get("id_number", "")).strip().upper()
            if not id_number:
                continue
            normalized_members.append(
                {
                    "name": str(member.get("name", "")).strip(),
                    "id_number": id_number,
                }
            )
    else:
        id_number = str(item.get("id_number", "")).strip().upper()
        if id_number:
            normalized_members.append(
                {
                    "name": str(item.get("name", "")).strip(),
                    "id_number": id_number,
                }
            )

    if not normalized_members:
        return None

    return {
        "group_key": str(item.get("group_key") or build_group_key(normalized_members)),
        "members": normalized_members,
        "desc": str(item.get("desc", "")).strip(),
        "added_time": str(item.get("added_time", "")).strip(),
    }





def split_viewer_blocks(text: str) -> List[str]:
    blocks: List[str] = []
    current_lines: List[str] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or SEPARATOR_LINE_RE.match(line):
            if current_lines:
                blocks.append("\n".join(current_lines).strip())
                current_lines = []
            continue

        current_lines.append(line)

    if current_lines:
        blocks.append("\n".join(current_lines).strip())

    return blocks


def parse_viewer_block(block: str) -> Optional[Dict[str, Any]]:
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    if not lines:
        return None

    members: List[Dict[str, str]] = []
    desc_lines: List[str] = []
    pending_name = ""

    for line in lines:
        pair_matches = list(PAIR_RE.finditer(line))
        reverse_pair_matches = list(REVERSE_PAIR_RE.finditer(line))
        if pair_matches or reverse_pair_matches:
            for match in pair_matches:
                members.append(
                    {
                        "name": match.group(1).strip(),
                        "id_number": match.group(2).upper(),
                    }
                )

            for match in reverse_pair_matches:
                members.append(
                    {
                        "name": match.group(2).strip(),
                        "id_number": match.group(1).upper(),
                    }
                )

            # 如果同一行除了姓名+身份证/身份证+姓名还有额外内容，保留为描述。
            remainder = PAIR_RE.sub("", line)
            remainder = REVERSE_PAIR_RE.sub("", remainder)
            remainder = remainder.strip(" ,，;；")
            if remainder:
                desc_lines.append(remainder)
            pending_name = ""
            continue

        name_label = NAME_LABEL_RE.match(line)
        if name_label:
            pending_name = name_label.group(1).strip()
            continue

        id_label = ID_LABEL_RE.match(line)
        if id_label:
            members.append(
                {
                    "name": pending_name,
                    "id_number": id_label.group(1).upper(),
                }
            )
            pending_name = ""
            continue

        if PURE_ID_RE.match(line) and pending_name:
            members.append({"name": pending_name, "id_number": line.upper()})
            pending_name = ""
            continue

        if PURE_NAME_RE.match(line):
            pending_name = line
            continue

        desc_lines.append(line)

    deduped_members: List[Dict[str, str]] = []
    seen_ids = set()
    for member in members:
        id_number = member["id_number"]
        if id_number in seen_ids:
            continue
        seen_ids.add(id_number)
        deduped_members.append(member)

    if not deduped_members:
        return None

    return {
        "group_key": build_group_key(deduped_members),
        "members": deduped_members,
        "desc": "\n".join(desc_lines)[:200],
    }

# ===================== 首页：直接访问 index.html =====================
@app.get("/")
async def read_index():
    # 优先返回 Vite 构建后的结果，如果没有则返回原始文件
    target_file = "dist/index.html" if os.path.exists("dist/index.html") else "index.html"
    return FileResponse(target_file, headers={
        "Cache-Control": "no-cache", # 开发环境建议 no-cache，生产环境可改为强缓存
        "Pragma": "no-cache"
    })

# ===================== 核心接口：接收抓包脚本转发的数据 =====================
@app.post("/receive")
async def receive_data(request: Request):
    try:
        # 1. 获取抓包脚本发送的完整数据
        send_data = await request.json()
        print("\n" + "="*50)
        print(f"【收到请求】 顶层字段: {list(send_data.keys())}")
        
        # 2. 尝试从不同路径提取 body
        body = None
        
        # 路径 A: response.body (最常见)
        if "response" in send_data:
            resp_obj = send_data["response"]
            print(f"【检测到 response 字段】 内部字段: {list(resp_obj.keys())}")
            body = resp_obj.get("body")
        
        # 路径 B: 顶层 body (部分脚本会把数据拍平)
        if not body and "body" in send_data:
            print("【检测到顶层 body 字段】")
            body = send_data["body"]

        # 如果都没有，打印出来看看
        if not body:
            print("【跳过】：当前请求不包含 body 数据")
            return {"status": "ignored", "msg": "未发现 body 数据"}
            
        # 3. 解析 body
        concert_data = None
        if isinstance(body, str):
            if not body.strip():
                print("【跳过】：body 为空字符串")
                return {"status": "ignored", "msg": "body 为空"}
            try:
                concert_data = json.loads(body)
            except Exception as je:
                print(f"【错误】：body 不是有效的 JSON 格式")
                return {"status": "error", "msg": "JSON 解析失败"}
        else:
            concert_data = body
            
        # 4. 提取核心业务数据 (适配抖音数据结构)
        if isinstance(concert_data, dict) and "data" in concert_data:
            print("【发现数据被包裹在 data 字段中，自动解包】")
            concert_data = concert_data["data"]

        # 检查必要的业务字段
        if not isinstance(concert_data, dict):
            print(f"【跳过】：解析后的数据不是字典类型: {type(concert_data)}")
            return {"status": "error", "msg": "数据格式错误"}

        if "product_name" not in concert_data:
            print(f"【错误】：缺少 product_name。当前可用字段: {list(concert_data.keys())}")
            return {"status": "error", "msg": "缺少演出名称"}

        if "show_sku_calendar_infos_map" not in concert_data:
            print(f"【错误】：缺少库存地图。当前可用字段: {list(concert_data.keys())}")
            return {"status": "error", "msg": "缺少库存数据"}

        calendar_map = concert_data["show_sku_calendar_infos_map"]
        if not calendar_map:
            print("【提示】：库存地图为空")
            return {"status": "success", "msg": "库存为空，跳过保存"}

        # 获取所有日期
        all_dates = sorted(list(calendar_map.keys()))
        
        # 构造保存项，包含抓取时间戳
        concert_info = {
            "name": concert_data["product_name"],
            "dates": all_dates, # 保存所有日期列表
            "stock_map": calendar_map, # 保存完整的日期-库存映射
            "fetch_time": datetime.now().strftime("%m-%d %H:%M:%S")
        }
        
        print(f"【提取成功】: {concert_info['name']} | 包含日期数: {len(all_dates)}")

        # 5. 保存到数据库
        db.save_concert(concert_info)
        print(f"【保存成功】: {concert_info['name']}")
        
        # 通知所有连接的 SSE 客户端
        for queue in list(clients):
            try:
                queue.put_nowait("concert_update")
            except Exception:
                pass
            
        return {"status": "success", "msg": "保存成功"}

    except Exception as e:
        import traceback
        print(f"【异常】: {traceback.format_exc()}")
        return {"status": "error", "msg": str(e)}
    finally:
        print("="*50 + "\n")

# ===================== AI 智能解析相关配置 =====================
# 默认使用豆包 (火山引擎) 或其他 OpenAI 兼容接口
# 您可以申请豆包 API Key: https://www.volcengine.com/product/doubao
AI_API_KEY = os.getenv("AI_API_KEY", "sk-zgclqbwmmqjcccdtlzlbjsutzkuiycbujyxzlxmmjrdywucz") # 建议在环境变量中设置
AI_BASE_URL = "https://api.siliconflow.cn/v1" # 豆包 V3 接口地址
AI_MODEL = "deepseek-ai/DeepSeek-V3" # 豆包推理接入点 ID

# 也可以使用 DeepSeek (SiliconFlow) 的免费模型
# AI_API_KEY = "sk-xxxxxxxx" 
# AI_BASE_URL = "https://api.siliconflow.cn/v1"
# AI_MODEL = "deepseek-ai/DeepSeek-V3"

@app.post("/api/ai/parse")
async def ai_parse_tickets(request: Request):
    if not AI_API_KEY:
        return {"status": "error", "msg": "未配置 AI API Key，请先 in main.py 或环境变量中配置"}
    
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "输入内容为空"}

    prompt = f"""
你是一个票务管理专家。请从给定的非结构化文本中智能提取票务订单信息。
文本可能包含一个或多个独立的票务订单。

请返回一个 JSON 数组，每个对象必须包含以下字段：
- show_name: 演出名称 (如: 五月天, 薛之谦, 徐良成都, tizzy t 成都)
- show_date: 演出日期 (如: 4号, 2026-05-17, 13号。如果文本中有'4号'，请保留'4号')
- viewers: 观影人列表 (字符串格式，每个观影人一行，格式为'姓名 身份证号')
- quantity: 票品数量 (整数，对应身份证的数量)
- price: 票价 (提取金额和座位类型。如: '980看台', '1580内场', '看台随机', '内场随机'。如果是多个票价，请合并为 '980看台, 1280内场')
- status: 状态 (必须是 '待抢'、'完成' 或 '退款' 之一，默认为 '待抢')
- notes: 备注信息 (提取加价部分，如 '+200' 记录为 '佣金200'；如果有多个加价，请对应合并，如 '佣金200, 50')

待解析文本：
\"\"\"
{text}
\"\"\"

规则：
1. 仅返回 JSON 数组本身，不要包含任何 Markdown 代码块标记（如 ```json）或解释文字。
2. 极其重要：如果文本中包含多个独立的订单（例如通过分割线、或不同姓名/身份证组区分），请拆分为多个 JSON 对象。
3. 尽可能准确地提取姓名和身份证。
4. 如果同一组人对应多个票价（如 980+200 和 1280+50），请将其合并到单条信息中，不要拆分。
"""

    # 经测试，以下模型在当前 API Key 下可用且稳定
    models_to_try = [
        "deepseek-ai/DeepSeek-V3",          # 最强提取能力
        "deepseek-ai/DeepSeek-V2.5",        # 极高性价比
        "Qwen/Qwen2.5-72B-Instruct-128K",   # 阿里大模型 (极其稳定)
        "Qwen/Qwen2.5-7B-Instruct"          # 免费且响应极快
    ]
    # 去重并保持顺序
    models_to_try = list(dict.fromkeys([m for m in models_to_try if m]))

    last_error = ""
    for model in models_to_try:
        try:
            # 针对大批量数据，统一延长超时时间到 60s
            # 判断不可用的标准：1. 超时 2. 明确的服务器错误 (500/502/503) 3. 频次限制 (429)
            current_timeout = 60.0
            print(f"AI: 正在尝试模型 {model} (超时 {current_timeout}s)...")
            
            async with httpx.AsyncClient(timeout=current_timeout, verify=False) as client:
                resp = await client.post(
                    f"{AI_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {AI_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "你是一个只输出 JSON 数组的票务提取助手。"},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "stream": False
                    }
                )
                
                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    
                    # 尝试解析 JSON
                    content = re.sub(r"```json\s*", "", content)
                    content = re.sub(r"\s*```", "", content)
                    
                    try:
                        parsed_data = json.loads(content)
                        if not isinstance(parsed_data, list):
                            parsed_data = [parsed_data]
                        print(f"AI: 模型 {model} 解析成功!")
                        # 成功解析后，让本地引擎学习演出名称
                        db.learn_show_names(parsed_data)
                        return {"status": "success", "data": parsed_data}
                    except json.JSONDecodeError:
                        print(f"AI: 模型 {model} 返回格式错误")
                        last_error = f"模型 {model} 格式错误"
                        continue
                elif resp.status_code in [429, 503]:
                    print(f"AI: 模型 {model} 繁忙 (状态码 {resp.status_code})")
                    last_error = "服务器繁忙"
                    continue
                else:
                    print(f"AI: 模型 {model} 调用失败 ({resp.status_code})")
                    last_error = f"接口报错 {resp.status_code}"
                    continue

        except Exception as e:
            print(f"AI: 模型 {model} 连接失败: {str(e)}")
            last_error = "网络连接失败"
            continue

    # 如果所有 AI 都挂了，尝试使用本地正则增强引擎进行“最后保命”
    print("AI: 所有在线模型均不可用，触发本地正则增强解析引擎...")
    try:
        local_data = local_advanced_parse(text)
        return {
            "status": "success", 
            "data": local_data, 
            "msg": "AI 接口暂不可用，已自动切换至本地增强引擎解析"
        }
    except Exception as e:
        return {"status": "error", "msg": f"AI 解析失败 ({last_error}) 且本地解析异常。"}

@app.post("/api/local/parse")
async def api_local_parse(request: Request):
    """专门暴露给前端的本地解析接口"""
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}
    try:
        data = local_advanced_parse(text)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def local_advanced_parse(text: str) -> List[Dict[str, Any]]:
    """本地高级正则解析引擎：作为 AI 挂掉时的保命方案"""
    results = []
    
    # 按照分割线或大换行拆分块
    blocks = re.split(r'—————————————|\n\s*\n', text)
    
    id_pattern = r"[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]"
    name_pattern = r"[\u4e00-\u9fa5]{2,8}"
    
    # 演出关键词：用来辅助判断哪一行是演出名称
    show_keywords = ["演唱会", "音乐节", "演出", "现场", "巡演", "五月天", "薛之谦", "徐良", "周深", "蔡依林", "黄丽玲", "周传雄", "tizzy", "成都", "北京", "苏州", "武汉", "郑州", "郑州"]
    
    learned_names = db.get_known_show_names()
    
    for block in blocks:
        block = block.strip()
        if not block: continue
        
        # 提取当前块的所有身份证和姓名
        ids = re.findall(id_pattern, block)
        if not ids: continue
        
        lines = block.split('\n')
        
        # --- 1. 提取演出名称逻辑优化 ---
        show_name = "未知演出"
        show_date = ""
        
        # 预先提取日期 (如 4号)
        date_match = re.search(r'(\d{1,2})号', block)
        if date_match:
            show_date = date_match.group(0)

        # 尝试从学习过的名称中匹配
        for ln in learned_names:
            if ln in block:
                show_name = ln
                break
        
        if show_name == "未知演出":
            for line in lines:
                line = line.strip()
                if not line: continue
                
                # 过滤掉明显的姓名+身份证行
                if re.search(id_pattern, line): continue
                
                # 清洗当前行，尝试找演出名
                temp_line = line
                # 移除日期
                temp_line = re.sub(r'\d{1,2}号', '', temp_line)
                # 移除价格+佣金 (如 1580+200, 955看台+200)
                temp_line = re.sub(r'\d{3,4}[\u4e00-\u9fa5]*\s*\+\s*\d+', '', temp_line)
                # 移除纯价格
                temp_line = re.sub(r'(?<!\d)\d{3,4}(?!\d)', '', temp_line)
                
                # 优化：不要随意移除所有人名，因为演出名可能包含人名（如 徐良）
                # 只有当某行包含明显的身份证时，才移除那行的人名。这里已经过滤了身份证行。
                # 所以我们只移除一些常见的干扰词
                temp_line = re.sub(r'连坐|一张|两张|佣金|备注|票价', '', temp_line)
                
                temp_line = temp_line.strip(',，-—_ \t')
                
                # 如果清洗后还有文字，且包含关键词或长度适中
                if temp_line and len(temp_line) >= 2:
                    if any(kw in line.lower() for kw in show_keywords) or len(temp_line) <= 20:
                        show_name = temp_line
                        break

        # --- 2. 提取票价和佣金逻辑优化 ---
        # 匹配 1580+200 或 980+200 1280+50 这种多组模式
        # 兼容 955看台+200
        price_comm_matches = re.findall(r'(\d{3,4})([\u4e00-\u9fa5]*)\s*\+\s*(\d+)', block)
        prices = []
        commissions = []
        identified_comm_nums = []
        
        if price_comm_matches:
            for p, seat, c in price_comm_matches:
                prices.append(f"{p}{seat}")
                commissions.append(f"佣金{c}")
                identified_comm_nums.append(c)
        
        # 补充提取纯数字票价和座位类型 (如: 1280看台, 1580内场, 看台随机, 内场随机)
        # 匹配 1280看台 或 1280内场
        seat_price_matches = re.findall(r'(\d{3,4})(看台|内场|随机|看台随机|内场随机)', block)
        for p, seat in seat_price_matches:
            full_p = f"{p}{seat}"
            if full_p not in prices:
                prices.append(full_p)

        # 匹配 看台随机, 内场随机 (没有具体金额的情况)
        random_seat_matches = re.findall(r'(看台随机|内场随机)', block)
        for rs in random_seat_matches:
            if rs not in prices:
                prices.append(rs)

        # 仅提取纯数字票价
        all_numbers = re.findall(r'(?<!\d)(\d{3,4})(?!\d)', block)
        date_num = date_match.group(1) if date_match else None
        for n in all_numbers:
            # 排除：日期数字、已识别的佣金数字、已识别的票价数字
            if n != date_num and n not in identified_comm_nums and n not in prices:
                # 简单判断是否是票价（通常是 380, 480, 580... 或 1280, 1580...）
                if n.endswith('0') or n.endswith('5') or int(n) > 200:
                    prices.append(n)

        # --- 3. 提取姓名逻辑 ---
        names = []
        # 记录已使用的身份证行中的姓名
        for line in lines:
            if re.search(id_pattern, line):
                # 在身份证附近找姓名
                # 模式1: 姓名 身份证
                match1 = re.search(r"([\u4e00-\u9fa5]{2,4})\s+" + id_pattern, line)
                if match1:
                    names.append(match1.group(1))
                    continue
                # 模式2: 身份证 姓名
                match2 = re.search(id_pattern + r"\s+([\u4e00-\u9fa5]{2,4})", line)
                if match2:
                    names.append(match2.group(1))
                    continue
                # 兜底：找该行所有姓名
                found_names = re.findall(r"[\u4e00-\u9fa5]{2,4}", line)
                for n in found_names:
                    if n not in ["连坐", "一张", "佣金", "备注", "票价"]:
                        names.append(n)
                        break
        
        # 兜底：如果身份证行没名字，去全块找
        if len(names) < len(ids):
            all_potential_names = re.findall(r"[\u4e00-\u9fa5]{2,4}", block)
            for n in all_potential_names:
                if n not in ["连坐", "一张", "佣金", "备注", "票价"] and n not in show_name and n not in names:
                    names.append(n)

        viewers = []
        for i, id_val in enumerate(ids):
            name_val = names[i] if i < len(names) else "未知"
            viewers.append(f"{name_val} {id_val}")

        results.append({
            "show_name": show_name,
            "show_date": show_date,
            "viewers": "\n".join(viewers),
            "quantity": len(ids),
            "price": ", ".join(list(dict.fromkeys(prices))),
            "status": "待抢",
            "notes": ", ".join(list(dict.fromkeys(commissions)))
        })
        
    return results if results else [{"show_name": "解析失败", "viewers": "请检查格式", "quantity": 1, "status": "待抢"}]

# ===================== 前端接口：获取所有演出数据 =====================
@app.get("/api/data")
async def get_concert_data():
    return db.get_all_concerts()

# ===================== 前端接口：删除指定演出数据 =====================
@app.delete("/api/data/{item_id}")
async def delete_concert_data(item_id: int):
    try:
        db.delete_concert(item_id)
        
        # 通知所有连接的 SSE 客户端
        for queue in list(clients):
            try:
                queue.put_nowait("concert_update")
            except Exception:
                pass
                
        return {"status": "success", "msg": "删除成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===================== 前端接口：获取观影人信息 =====================
@app.get("/api/viewers")
async def get_viewers():
    return db.get_all_viewers()

# ===================== 前端接口：识别并保存观影人信息 =====================
@app.post("/api/viewers/parse")
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

    # 准备合并逻辑
    existing = db.get_all_viewers()
    existing_by_key = {item["group_key"]: item for item in existing}

    added = 0
    now_str = datetime.now().strftime("%m-%d %H:%M:%S")
    to_save = []
    
    for item in extracted:
        group_key = item["group_key"]
        existing_item = existing_by_key.get(group_key)
        if existing_item:
            # 更新已有项
            existing_item["desc" ] = item.get("desc", "") or existing_item.get("desc", "")
            for idx, member in enumerate(item.get("members", [])):
                if idx >= len(existing_item["members"]):
                    existing_item["members"].append(member)
                    continue
                if member.get("name"):
                    existing_item["members"][idx]["name"] = member["name"]
            to_save.append(existing_item)
        else:
            # 新增项
            new_item = {
                "group_key": group_key,
                "members": item.get("members", []),
                "desc": item.get("desc", ""),
                "added_time": now_str,
            }
            to_save.append(new_item)
            added += 1

    db.save_viewers_batch(to_save)

    for queue in list(clients):
        try:
            queue.put_nowait("viewer_update")
        except Exception:
            pass

    return {"status": "success", "added": added, "items": extracted}

# ===================== 前端接口：删除指定观影人 =====================
@app.delete("/api/viewers/{group_key}")
async def delete_viewer(group_key: str):
    db.delete_viewer(group_key)
    for queue in list(clients):
        try:
            queue.put_nowait("viewer_update")
        except Exception:
            pass
    return {"status": "success", "msg": "删除成功"}

# ===================== 前端接口：清空观影人列表 =====================
@app.delete("/api/viewers")
async def clear_viewers():
    db.clear_viewers()
    for queue in list(clients):
        try:
            queue.put_nowait("viewer_update")
        except Exception:
            pass
    return {"status": "success", "msg": "已清空"}

# ===================== ID 列表相关接口 =====================

async def fetch_damai_title(url: str) -> str:
    # 尝试将移动端 URL 转换为 PC 端 URL，因为 PC 端页面包含完整的标题信息
    target_url = url
    item_id_match = re.search(r"itemId=(\d+)", url)
    if not item_id_match:
        item_id_match = re.search(r"id=(\d+)", url)
    
    if item_id_match:
        item_id = item_id_match.group(1)
        target_url = f"https://detail.damai.cn/item.htm?id={item_id}"
        print(f"Crawler: 转换 URL 为 PC 端: {target_url}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://www.damai.cn/",
            }
            resp = await client.get(target_url, headers=headers, follow_redirects=True)
            print(f"Crawler: 请求状态码: {resp.status_code}")
            
            if resp.status_code == 200:
                # 尝试从 title 标签获取
                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    print(f"Crawler: 原始标题: {title}")
                    # 清洗标题
                    title = re.sub(r"【网上订票】.*$", "", title)
                    title = title.replace("-大麦网", "").replace("-详情页", "").strip()
                    if title and title != "商品详情":
                        return title
                
                # 尝试从 itemName 匹配
                name_match = re.search(r'"itemName"\s*:\s*"(.*?)"', resp.text)
                if name_match:
                    return name_match.group(1).strip()

                # 尝试从 OG title 匹配
                og_match = re.search(r'property="og:title"\s+content="(.*?)"', resp.text)
                if og_match:
                    return og_match.group(1).strip()
    except Exception as e:
        print(f"Crawler Error: {e}")
    
    # 如果 PC 端失败，尝试原始 URL (兜底)
    if target_url != url:
        print(f"Crawler: PC 端抓取失败，尝试原始 URL...")
        pass

    return "未知演出"

@app.post("/api/idlist/parse")
async def parse_id_list(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}

    # 提取 URL
    url_match = re.search(r"https?://[^\s]+", text)
    url = url_match.group(0) if url_match else ""
    
    # 提取演出标题
    title = "未知演出"
    if url:
        title = await fetch_damai_title(url)

    # 提取项目 ID 和票价 ID
    lines = text.splitlines()
    parsed_items = []
    
    # 提取 itemId (项目 ID)
    item_id = ""
    if url:
        item_id_match = re.search(r"itemId=(\d+)", url)
        if item_id_match:
            item_id = item_id_match.group(1)

    for line in lines:
        line = line.strip()
        if not line: continue
        
        # 匹配包含两个 ID 的行
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

    # 保存到数据库
    db.save_id_project(item_id, title, url, parsed_items)

    return {"status": "success", "msg": "解析成功"}

@app.get("/api/idlist")
async def get_id_list():
    return db.get_id_projects()

@app.get("/api/idlist/{item_id}")
async def delete_id_group(item_id: str):
    db.delete_id_project(item_id)
    return {"status": "success", "msg": "删除成功"}

# ===================== 票务系统相关接口 =====================

@app.get("/api/tickets_sys")
async def get_tickets_sys(search: str = None, show_name: str = None, viewer: str = None, status: str = None):
    return db.get_all_tickets_sys(search, show_name, viewer, status)

@app.post("/api/tickets_sys")
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

@app.post("/api/tickets_sys/bulk")
async def add_tickets_bulk(request: Request):
    payload = await request.json()
    items = payload.get("items", [])
    if not items:
        return {"status": "error", "msg": "数据为空"}
    
    # 使用 run_in_executor 优化同步数据库写入
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, db.save_tickets_bulk, items)
    return {"status": "success", "msg": f"成功保存 {count} 条数据"}

@app.put("/api/tickets_sys/{ticket_id}")
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

@app.patch("/api/tickets_sys/{ticket_id}/status")
async def update_ticket_status(ticket_id: int, request: Request):
    payload = await request.json()
    status = payload.get("status")
    db.update_ticket_status(ticket_id, status)
    return {"status": "success", "msg": "状态更新成功"}

@app.delete("/api/tickets_sys/{ticket_id}")
async def delete_ticket_sys(ticket_id: int):
    db.delete_ticket_sys(ticket_id)
    return {"status": "success", "msg": "删除成功"}

@app.post("/api/tickets_sys/bulk_delete")
async def delete_tickets_bulk(request: Request):
    payload = await request.json()
    ticket_ids = payload.get("ids", [])
    if not ticket_ids:
        return {"status": "error", "msg": "未选择要删除的数据"}
    
    count = db.delete_tickets_bulk(ticket_ids)
    return {"status": "success", "msg": f"成功删除 {count} 条记录"}

@app.delete("/api/tickets_sys/all/clear")
async def clear_all_tickets():
    db.clear_all_tickets_sys()
    return {"status": "success", "msg": "所有票务数据已清空"}

# ===================== 虚拟号表相关接口 =====================

@app.get("/api/virtual_numbers")
async def get_virtual_numbers(search: str = None, page: int = 1, page_size: int = 20, has_mobile: bool = None, usage_count: int = None, cancellation_count: int = None):
    # 使用 run_in_executor 防止数据库 I/O 阻塞主线程
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.get_virtual_numbers_paginated, search, page, page_size, has_mobile, usage_count, cancellation_count)

@app.post("/api/virtual_numbers/bulk")
async def add_virtual_numbers_bulk(request: Request):
    payload = await request.json()
    text = payload.get("text", "")
    if not text:
        return {"status": "error", "msg": "内容不能为空"}
    
    # 解析逻辑：前面数字是号码，后面是链接，通常由 ---- 分隔
    items = []
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if not line: continue
        
        # 支持多种分隔符，优先匹配 ----
        if "----" in line:
            parts = line.split("----")
            phone = parts[0].strip()
            link = parts[1].strip()
        elif " " in line:
            parts = line.split(None, 1)
            phone = parts[0].strip()
            link = parts[1].strip()
        else:
            # 尝试正则提取号码和链接
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
    
    # 使用 run_in_executor 防止数据库同步操作阻塞异步事件循环
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, db.save_virtual_numbers_bulk, items)
    return {"status": "success", "msg": f"成功保存 {count} 条虚拟号数据"}

@app.delete("/api/virtual_numbers/{item_id}")
async def delete_virtual_number(item_id: int):
    db.delete_virtual_number(item_id)
    return {"status": "success", "msg": "删除成功"}

@app.post("/api/virtual_numbers/{item_id}/increment")
async def increment_virtual_number_usage(item_id: int):
    db.increment_usage_count(item_id)
    return {"status": "success", "msg": "使用次数已更新"}

@app.post("/api/virtual_numbers/{item_id}/decrement")
async def decrement_virtual_number_usage(item_id: int):
    db.decrement_usage_count(item_id)
    return {"status": "success", "msg": "使用次数已更新"}

@app.get("/api/virtual_numbers/used_mobiles")
async def get_used_mobiles():
    """获取所有已被分配的手机号列表"""
    loop = asyncio.get_event_loop()
    used_list = await loop.run_in_executor(None, db.get_used_mobile_numbers)
    return {"status": "success", "used": used_list}

@app.get("/api/mobile_library")
async def get_mobile_library():
    """获取手机号库列表"""
    return db.get_mobile_library()

@app.post("/api/mobile_library")
async def add_mobile_to_library(request: Request):
    """添加手机号到库"""
    payload = await request.json()
    phone = payload.get("phone", "").strip()
    if not phone:
        return {"status": "error", "msg": "手机号不能为空"}
    success = db.add_to_mobile_library(phone)
    if success:
        return {"status": "success", "msg": "添加成功"}
    return {"status": "error", "msg": "添加失败，可能已存在"}

@app.delete("/api/mobile_library/{phone}")
async def delete_mobile_from_library(phone: str):
    """从库中删除手机号"""
    db.delete_from_mobile_library(phone)
    return {"status": "success", "msg": "已从库中删除"}

@app.get("/api/quick_copy_tools")
async def get_quick_copy_tools():
    """获取快捷工具列表"""
    return db.get_quick_copy_tools()

@app.post("/api/quick_copy_tools")
async def add_quick_copy_tool(request: Request):
    """新增快捷工具"""
    payload = await request.json()
    label = payload.get("label", "").strip()
    content = payload.get("content", "").strip()
    color = payload.get("color", "")
    bg_color = payload.get("bg_color", "")
    if not label or not content:
        return {"status": "error", "msg": "标签和内容不能为空"}
    db.add_quick_copy_tool(label, content, color, bg_color)
    return {"status": "success", "msg": "添加成功"}

@app.put("/api/quick_copy_tools/{tool_id}")
async def update_quick_copy_tool(tool_id: int, request: Request):
    """更新快捷工具"""
    payload = await request.json()
    label = payload.get("label", "").strip()
    content = payload.get("content", "").strip()
    color = payload.get("color", "")
    bg_color = payload.get("bg_color", "")
    if not label or not content:
        return {"status": "error", "msg": "标签和内容不能为空"}
    db.update_quick_copy_tool(tool_id, label, content, color, bg_color)
    return {"status": "success", "msg": "更新成功"}

@app.delete("/api/quick_copy_tools/{tool_id}")
async def delete_quick_copy_tool(tool_id: int):
    """删除快捷工具"""
    db.delete_quick_copy_tool(tool_id)
    return {"status": "success", "msg": "删除成功"}

@app.post("/api/virtual_numbers/{item_id}/cancellation/increment")
async def increment_virtual_number_cancellation(item_id: int):
    db.increment_cancellation_count(item_id)
    return {"status": "success", "msg": "注销次数已更新，手机号已自动清除"}

@app.post("/api/virtual_numbers/{item_id}/cancellation/decrement")
async def decrement_virtual_number_cancellation(item_id: int):
    db.decrement_cancellation_count(item_id)
    return {"status": "success", "msg": "注销次数已更新"}

@app.patch("/api/virtual_numbers/{item_id}/notes")
async def update_virtual_number_notes(item_id: int, request: Request):
    payload = await request.json()
    notes = payload.get("notes", "")
    db.update_virtual_number_notes(item_id, notes)
    return {"status": "success", "msg": "备注已更新"}

@app.patch("/api/virtual_numbers/{item_id}/mobile")
async def update_virtual_number_mobile(item_id: int, request: Request):
    payload = await request.json()
    mobile = payload.get("mobile", "")
    loop = asyncio.get_event_loop()
    deleted_count = await loop.run_in_executor(None, db.update_virtual_number_mobile, item_id, mobile)
    msg = "手机号已更新"
    if deleted_count > 0:
        msg = f"手机号已更新，并自动删除了 {deleted_count} 条重复旧项"
    return {"status": "success", "msg": msg, "deleted_count": deleted_count}

@app.patch("/api/virtual_numbers/{item_id}/machine_code")
async def update_virtual_number_machine_code(item_id: int, request: Request):
    payload = await request.json()
    machine_code = payload.get("machine_code", "")
    db.update_virtual_number_machine_code(item_id, machine_code)
    return {"status": "success", "msg": "机器码已更新"}

@app.patch("/api/virtual_numbers/{item_id}/sms")
async def update_virtual_number_sms(item_id: int, request: Request):
    payload = await request.json()
    sms_code = payload.get("sms_code", "")
    db.update_virtual_number_sms(item_id, sms_code)
    return {"status": "success", "msg": "验证码已同步"}

@app.get("/api/virtual_numbers/proxy_fetch")
async def proxy_fetch_sms(url: str):
    """代理请求短信验证码链接，解决跨域问题"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            return {"status": "success", "content": resp.text}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

@app.delete("/api/virtual_numbers/all/clear")
async def clear_all_virtual_numbers():
    db.clear_all_virtual_numbers()
    return {"status": "success", "msg": "所有虚拟号数据已清空"}

# ===================== RPA 专用接口 =====================

@app.post("/api/rpa/claim")
async def rpa_claim_number(request: Request):
    """
    供影刀/RPA调用：获取一个可用号码并自动绑定机器码
    Payload: { "machine_code": "云机-01" }
    """
    try:
        body = await request.body()
        body_str = body.decode('utf-8', errors='ignore')
        print(f"RPA Claim Request Body: {body_str}")
        payload = json.loads(body_str)
    except Exception as e:
        # 容错处理：如果 JSON 解析失败，尝试从原始字符串中提取关键信息
        print(f"JSON Parse Error: {e}. Attempting manual extraction...")
        # 匹配 machine_code 或 machine_codes 后面的内容
        import re
        # 匹配规则：匹配 machine_codes? 后面跟着 : 或 =，然后跳过引号，抓取到下一个引号、逗号或大括号之前的内容
        match = re.search(r'machine_codes?["\']?\s*[:=]\s*["\']?([^"\'\s,{}]+)["\']?', body_str)
        if match:
            machine_code = match.group(1)
            print(f"Manual Extraction Success: {machine_code}")
        else:
            return {
                "status": "error", 
                "msg": "JSON格式错误且无法自动纠错", 
                "detail": f"解析失败: {str(e)}",
                "received": body_str
            }
    else:
        machine_code = payload.get("machine_code") or payload.get("machine_codes")

    if not machine_code:
        return {"status": "error", "msg": "必须提供 machine_code 字段"}
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, db.claim_virtual_number, machine_code)
    
    if result:
        return {
            "status": "success",
            "data": result,
            "msg": f"已成功为 {machine_code} 分配号码"
        }
    else:
        return {
            "status": "error",
            "msg": "没有可用号码（次数<3且未被占用）"
        }

@app.get("/api/auth/check")
async def auth_check(request: Request):
    client_ip = request.client.host
    if is_local_ip(client_ip):
        return {"status": "success", "is_local": True}
    return {"status": "auth_required", "is_local": False}

# ===================== SSE 接口：实时推送数据更新通知 =====================
@app.get("/api/events")
async def event_stream(request: Request):
    queue = asyncio.Queue()
    clients.add(queue)
    
    async def event_generator():
        try:
            while True:
                # 检查连接是否已断开
                if await request.is_disconnected():
                    break
                
                # 等待队列中的更新消息
                try:
                    # 使用 wait_for 避免无限期阻塞，以便能定期检查连接状态
                    message = await asyncio.wait_for(queue.get(), timeout=10.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # 发送心跳包以维持连接
                    yield ": keep-alive\n\n"
                    
        finally:
            clients.discard(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
