import re
import httpx

async def fetch_damai_title(url: str) -> str:
    item_id_match = re.search(r"itemId=(\d+)", url)
    if not item_id_match:
        item_id_match = re.search(r"id=(\d+)", url)
    
    if not item_id_match:
        return "未知演出"
    
    item_id = item_id_match.group(1)
    
    # 1. 优先尝试搜索接口，通常更容易获取标题且不易被封
    search_url = f"https://search.damai.cn/searchajax.html?keyword={item_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://search.damai.cn/search.htm",
            }
            resp = await client.get(search_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("pageData", {}).get("resultData"):
                    result = data["pageData"]["resultData"][0]
                    title = result.get("name") or result.get("projectName")
                    if title:
                        return title.replace("<em>", "").replace("</em>", "").strip()
    except Exception as e:
        print(f"Search API Error: {e}")

    # 2. 尝试移动端详情页
    m_url = f"https://m.damai.cn/damai/detail/item.html?itemId={item_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            }
            resp = await client.get(m_url, headers=headers, follow_redirects=True)
            if resp.status_code == 200:
                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    if title and title not in ["商品详情", "大麦", "网上订票"]:
                        return title
    except Exception as e:
        print(f"Mobile page Error: {e}")

    # 3. 兜底尝试 PC 详情页
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
                # 尝试从 JSON 中提取
                name_match = re.search(r'"itemName"\s*:\s*"(.*?)"', resp.text)
                if name_match:
                    return name_match.group(1).strip()
                
                name_match2 = re.search(r'"name"\s*:\s*"(.*?)"', resp.text)
                if name_match2:
                    name = name_match2.group(1).strip()
                    if len(name) > 2 and name != "大麦网":
                        return name

                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    title = title.replace("【网上订票】", "").replace("-大麦网", "").replace("-详情页", "").strip()
                    if title and title not in ["商品详情", "大麦", "网上订票"]:
                        return title
                
                og_match = re.search(r'property="og:title"\s+content="(.*?)"', resp.text)
                if og_match:
                    return og_match.group(1).strip()
    except Exception as e:
        print(f"Crawler Error: {e}")
    
    return "未知演出"
