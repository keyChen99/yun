import re
import httpx

async def fetch_damai_title(url: str) -> str:
    item_id_match = re.search(r"itemId=(\d+)", url)
    if not item_id_match:
        item_id_match = re.search(r"id=(\d+)", url)
    
    if not item_id_match:
        print(f"[Crawler] [Error] Could not find itemID in URL: {url}")
        return "未知演出"
    
    item_id = item_id_match.group(1)
    print(f"[Crawler] [Start] Target ItemID: {item_id}")
    
    # 1. 优先尝试搜索接口
    search_url = f"https://search.damai.cn/searchajax.html?keyword={item_id}"
    print(f"[Crawler] [Step 1] Trying Search API: {search_url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://search.damai.cn/search.htm",
            }
            resp = await client.get(search_url, headers=headers)
            print(f"[Crawler] [Step 1] Response Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("pageData", {}).get("resultData"):
                    result = data["pageData"]["resultData"][0]
                    title = result.get("name") or result.get("projectName")
                    if title:
                        title = title.replace("<em>", "").replace("</em>", "").strip()
                        print(f"[Crawler] [Step 1] Success! Title: {title}")
                        return title
                else:
                    print(f"[Crawler] [Step 1] No resultData in JSON response.")
            else:
                print(f"[Crawler] [Step 1] Search API failed with status {resp.status_code}")
    except Exception as e:
        print(f"[Crawler] [Step 1] Error: {e}")

    # 2. 尝试移动端详情页
    m_url = f"https://m.damai.cn/damai/detail/item.html?itemId={item_id}"
    print(f"[Crawler] [Step 2] Trying Mobile Page: {m_url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            }
            resp = await client.get(m_url, headers=headers, follow_redirects=True)
            print(f"[Crawler] [Step 2] Response Status: {resp.status_code}, Final URL: {resp.url}")
            if resp.status_code == 200:
                # 检查是否包含反爬关键词
                if "punish" in str(resp.url) or "captcha" in resp.text or "验证码" in resp.text:
                    print(f"[Crawler] [Step 2] Detected Anti-Crawler (Punish/Captcha) page.")
                
                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    print(f"[Crawler] [Step 2] Found Title Tag: {title}")
                    if title and title not in ["商品详情", "大麦", "网上订票"]:
                        return title
            else:
                print(f"[Crawler] [Step 2] Mobile page failed with status {resp.status_code}")
    except Exception as e:
        print(f"[Crawler] [Step 2] Error: {e}")

    # 3. 兜底尝试 PC 详情页
    target_url = f"https://detail.damai.cn/item.htm?id={item_id}"
    print(f"[Crawler] [Step 3] Trying PC Page: {target_url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://www.damai.cn/",
            }
            resp = await client.get(target_url, headers=headers, follow_redirects=True)
            print(f"[Crawler] [Step 3] Response Status: {resp.status_code}, Final URL: {resp.url}")
            
            if resp.status_code == 200:
                # 检查是否包含反爬关键词
                if "punish" in str(resp.url) or "captcha" in resp.text or "验证码" in resp.text:
                    print(f"[Crawler] [Step 3] Detected Anti-Crawler (Punish/Captcha) page.")
                
                # 尝试从 JSON 中提取
                name_match = re.search(r'"itemName"\s*:\s*"(.*?)"', resp.text)
                if name_match:
                    title = name_match.group(1).strip()
                    print(f"[Crawler] [Step 3] Success! Found itemName in JSON: {title}")
                    return title
                
                name_match2 = re.search(r'"name"\s*:\s*"(.*?)"', resp.text)
                if name_match2:
                    name = name_match2.group(1).strip()
                    if len(name) > 2 and name != "大麦网":
                        print(f"[Crawler] [Step 3] Success! Found name in JSON: {name}")
                        return name

                title_match = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                if title_match:
                    title = title_match.group(1).strip()
                    print(f"[Crawler] [Step 3] Found Title Tag: {title}")
                    title = title.replace("【网上订票】", "").replace("-大麦网", "").replace("-详情页", "").strip()
                    if title and title not in ["商品详情", "大麦", "网上订票"]:
                        return title
                
                print(f"[Crawler] [Step 3] No valid title/itemName found in body. Body length: {len(resp.text)}")
            else:
                print(f"[Crawler] [Step 3] PC page failed with status {resp.status_code}")
    except Exception as e:
        print(f"[Crawler] [Step 3] Error: {e}")
    
    print(f"[Crawler] [End] Failed to fetch title for {item_id}")
    return "未知演出"
