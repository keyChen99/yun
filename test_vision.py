import asyncio
import base64
import httpx
import json
import os
import re
import sys

# 从 app.core.config 导入配置
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import AI_API_KEY, AI_BASE_URL

# 待测试的视觉模型列表
VISION_MODELS = [
    "Qwen/Qwen3-VL-8B-Instruct",
    "Qwen/Qwen3-VL-32B-Instruct",
    "deepseek-ai/DeepSeek-V4-Flash",
    "PaddlePaddle/PaddleOCR-VL-1.5"
]

async def test_model(model_id, base64_image):
    print(f"\n{'='*20} Testing Model: {model_id} {'='*20}")
    prompt = """
提取图中所有的演出名称和对应的开票时间。
请直接返回 JSON 数组，每个对象包含 show_name 和 sale_time 字段。
开票时间格式为 YYYY-MM-DD HH:mm:ss。
"""
    try:
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            resp = await client.post(
                f"{AI_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {AI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_id,
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
                print(f"SUCCESS! Output:\n{content}")
                return True
            else:
                print(f"FAILED. Status: {resp.status_code}, Body: {resp.text}")
                return False
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_vision.py <image_path>")
        return

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(f"Error: File not found: {image_path}")
        return

    # 读取并转换图片为 base64
    with open(image_path, "rb") as f:
        base64_image = base64.b64encode(f.read()).decode("utf-8")

    print(f"Starting test with image: {image_path}")
    print(f"API Key: {AI_API_KEY[:10]}...{AI_API_KEY[-5:]}")
    
    results = {}
    for model in VISION_MODELS:
        success = await test_model(model, base64_image)
        results[model] = "PASS" if success else "FAIL"

    print(f"\n{'#'*20} FINAL SUMMARY {'#'*20}")
    for model, status in results.items():
        print(f"{model}: {status}")

if __name__ == "__main__":
    asyncio.run(main())
