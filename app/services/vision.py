import json
import base64
import httpx
import re
from typing import Dict, Any, Optional, List
from app.core.config import AI_API_KEY, AI_BASE_URL, get_now_cst

from datetime import datetime

# 视觉模型列表（根据测试结果，Qwen3-VL-32B 效果最好）
VISION_MODELS = [
    "Qwen/Qwen3-VL-32B-Instruct",
    "Qwen/Qwen3-VL-8B-Instruct",
    "deepseek-ai/DeepSeek-V4-Flash",
    "PaddlePaddle/PaddleOCR-VL-1.5"
]

def format_sale_time(raw_time_str: str) -> str:
    """
    根据 AI 识别的原始时间字符串，智能拼凑完整的 YYYY-MM-DD HH:mm:ss
    """
    now = get_now_cst()
    current_year = now.year
    
    # 清洗字符串，去掉空格等
    t = raw_time_str.strip()
    
    # 场景 1: 只有时间，如 "11:00" 或 "11:00:00"
    time_match = re.match(r'^(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?$', t)
    if time_match:
        h, m, s = time_match.groups()
        s = s or "00"
        return f"{now.strftime('%Y-%m-%d')} {h.zfill(2)}:{m.zfill(2)}:{s.zfill(2)}"
    
    # 场景 2: 包含月日，如 "5月20日 12:00" 或 "05-20 12:00"
    # 尝试匹配月日
    date_pattern = re.search(r'(?:(\d{1,2})[月\-](\d{1,2})日?)\s*(\d{1,2})[:：](\d{1,2})', t)
    if date_pattern:
        month, day, h, m = date_pattern.groups()
        return f"{current_year}-{month.zfill(2)}-{day.zfill(2)} {h.zfill(2)}:{m.zfill(2)}:00"

    # 场景 3: AI 已经返回了完整格式但年份可能错误
    # 提取其中的月日时分秒
    full_pattern = re.search(r'(\d{1,2})[月\-](\d{1,2})日?\s*(\d{1,2})[:：](\d{1,2})', t)
    if full_pattern:
        month, day, h, m = full_pattern.groups()
        return f"{current_year}-{month.zfill(2)}-{day.zfill(2)} {h.zfill(2)}:{m.zfill(2)}:00"

    # 兜底：如果完全无法识别格式，返回当前时间
    return now.strftime('%Y-%m-%d %H:%M:%S')

async def parse_show_image(base64_image: str) -> Optional[List[Dict[str, Any]]]:
    """
    通过 AI 视觉模型解析图片中的多个演出名称和开票时间
    """
    if not AI_API_KEY:
        print("AI Vision Error: AI_API_KEY is not set")
        return None

    # 如果包含 base64 前缀，去掉它
    if "," in base64_image:
        base64_image = base64_image.split(",")[1]

    prompt = """
你是一个票务助手。请分析这张图片，提取其中所有的演出名称和对应的开票时间（开售时间）。
请直接返回一个 JSON 数组，每个对象包含以下字段：
- show_name: 演出名称
- raw_time: 图片中显示的原始时间文字（例如 "11:00"、"5月20日 12:00"、"明天 10:00"）

不要尝试补全日期或年份，只需要提取图片中看到的原始时间文字。
如果无法提取任何内容，请返回空数组 []。
仅返回 JSON 数组，不要有任何 Markdown 标记。
"""

    last_error = ""
    for model in VISION_MODELS:
        try:
            print(f"AI Vision: Trying model {model}...")
            async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
                resp = await client.post(
                    f"{AI_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {AI_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/jpeg;base64,{base64_image}"
                                        }
                                    }
                                ]
                            }
                        ],
                        "temperature": 0.1
                    }
                )
                
                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    print(f"AI Vision Raw Output ({model}): {content}")
                    
                    # 去掉 Markdown 标记
                    content = re.sub(r"```json\s*", "", content)
                    content = re.sub(r"\s*```", "", content)
                    
                    try:
                        data_list = json.loads(content)
                        if not isinstance(data_list, list):
                            data_list = [data_list]
                        
                        # 在本地处理时间，补全日期
                        processed_list = []
                        for item in data_list:
                            if item.get("show_name") and item.get("raw_time"):
                                processed_list.append({
                                    "show_name": item["show_name"],
                                    "sale_time": format_sale_time(item["raw_time"])
                                })
                        
                        if processed_list:
                            print(f"AI Vision Processed Data: {processed_list}")
                            return processed_list
                    except Exception as je:
                        print(f"AI Vision JSON Parse Error: {je}")
                else:
                    print(f"AI Vision Model {model} failed: {resp.status_code} - {resp.text}")
                    last_error = f"{resp.status_code}: {resp.text}"
        except Exception as e:
            print(f"AI Vision Model {model} error: {e}")
            last_error = str(e)
            
    return None
