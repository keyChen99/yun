import json
import re
import httpx
from typing import List, Dict, Any
from app.core.config import AI_API_KEY, AI_BASE_URL
from app.database import db_manager as db
from app.services.parser import local_advanced_parse

async def ai_parse_tickets(text: str) -> Dict[str, Any]:
    if not AI_API_KEY:
        return {"status": "error", "msg": "未配置 AI API Key"}
    
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

    models_to_try = [
        "deepseek-ai/DeepSeek-V3",
        "deepseek-ai/DeepSeek-V2.5",
        "Qwen/Qwen2.5-72B-Instruct-128K",
        "Qwen/Qwen2.5-7B-Instruct"
    ]
    models_to_try = list(dict.fromkeys([m for m in models_to_try if m]))

    last_error = ""
    for model in models_to_try:
        try:
            current_timeout = 60.0
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
                    content = re.sub(r"```json\s*", "", content)
                    content = re.sub(r"\s*```", "", content)
                    
                    try:
                        parsed_data = json.loads(content)
                        if not isinstance(parsed_data, list):
                            parsed_data = [parsed_data]
                        db.learn_show_names(parsed_data)
                        return {"status": "success", "data": parsed_data}
                    except json.JSONDecodeError:
                        last_error = f"模型 {model} 格式错误"
                        continue
                elif resp.status_code in [429, 503]:
                    last_error = "服务器繁忙"
                    continue
                else:
                    last_error = f"接口报错 {resp.status_code}"
                    continue

        except Exception as e:
            last_error = "网络连接失败"
            continue

    try:
        local_data = local_advanced_parse(text)
        return {
            "status": "success", 
            "data": local_data, 
            "msg": "AI 接口暂不可用，已自动切换至本地增强引擎解析"
        }
    except Exception as e:
        return {"status": "error", "msg": f"AI 解析失败 ({last_error}) 且本地解析异常。"}
