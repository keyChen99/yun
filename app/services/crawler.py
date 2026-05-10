import re
import httpx

async def fetch_damai_title(url: str) -> str:
    # 尝试将移动端 URL 转换为 PC 端 URL
    target_url = url
    item_id_match = re.search(r"itemId=(\d+)", url)
    if not item_id_match:
        item_id_match = re.search(r"id=(\d+)", url)
    
    if item_id_match:
        item_id = item_id_match.group(1)
        target_url = f"https://detail.damai.cn/item.htm?id={item_id}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://www.damai.cn/",
            }
            resp = await client.get(target_url, headers=headers, follow_redirects=True)
            
            if resp.status_code == 200:
                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    title = re.sub(r"【网上订票】.*$", "", title)
                    title = title.replace("-大麦网", "").replace("-详情页", "").strip()
                    if title and title != "商品详情":
                        return title
                
                name_match = re.search(r'"itemName"\s*:\s*"(.*?)"', resp.text)
                if name_match:
                    return name_match.group(1).strip()

                og_match = re.search(r'property="og:title"\s+content="(.*?)"', resp.text)
                if og_match:
                    return og_match.group(1).strip()
    except Exception as e:
        print(f"Crawler Error: {e}")
    
    return "未知演出"
