import re
from typing import List, Dict, Any, Optional
from app.core.config import (
    PAIR_RE, REVERSE_PAIR_RE, NAME_LABEL_RE, ID_LABEL_RE, 
    PURE_NAME_RE, PURE_ID_RE, SEPARATOR_LINE_RE, ID_PATTERN
)
from app.database import db_manager as db

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

def local_advanced_parse(text: str) -> List[Dict[str, Any]]:
    """本地高级正则解析引擎：作为 AI 挂掉时的保命方案"""
    results = []
    
    blocks = re.split(r'—————————————|\n\s*\n', text)
    
    id_pattern = ID_PATTERN
    
    show_keywords = ["演唱会", "音乐节", "演出", "现场", "巡演", "五月天", "薛之谦", "徐良", "周深", "蔡依林", "黄丽玲", "周传雄", "tizzy", "成都", "北京", "苏州", "武汉", "郑州"]
    
    learned_names = db.get_known_show_names()
    
    for block in blocks:
        block = block.strip()
        if not block: continue
        
        ids = re.findall(id_pattern, block)
        if not ids: continue
        
        lines = block.split('\n')
        
        show_name = "未知演出"
        show_date = ""
        
        date_match = re.search(r'(\d{1,2})号', block)
        if date_match:
            show_date = date_match.group(0)

        for ln in learned_names:
            if ln in block:
                show_name = ln
                break
        
        if show_name == "未知演出":
            for line in lines:
                line = line.strip()
                if not line: continue
                
                if re.search(id_pattern, line): continue
                
                temp_line = line
                temp_line = re.sub(r'\d{1,2}号', '', temp_line)
                temp_line = re.sub(r'\d{3,4}[\u4e00-\u9fa5]*\s*\+\s*\d+', '', temp_line)
                temp_line = re.sub(r'(?<!\d)\d{3,4}(?!\d)', '', temp_line)
                temp_line = re.sub(r'连坐|一张|两张|佣金|备注|票价', '', temp_line)
                
                temp_line = temp_line.strip(',，-—_ \t')
                
                if temp_line and len(temp_line) >= 2:
                    if any(kw in line.lower() for kw in show_keywords) or len(temp_line) <= 20:
                        show_name = temp_line
                        break

        price_comm_matches = re.findall(r'(\d{3,4})([\u4e00-\u9fa5]*)\s*\+\s*(\d+)', block)
        prices = []
        commissions = []
        identified_comm_nums = []
        
        if price_comm_matches:
            for p, seat, c in price_comm_matches:
                prices.append(f"{p}{seat}")
                commissions.append(f"佣金{c}")
                identified_comm_nums.append(c)
        
        seat_price_matches = re.findall(r'(\d{3,4})(看台|内场|随机|看台随机|内场随机)', block)
        for p, seat in seat_price_matches:
            full_p = f"{p}{seat}"
            if full_p not in prices:
                prices.append(full_p)

        random_seat_matches = re.findall(r'(看台随机|内场随机)', block)
        for rs in random_seat_matches:
            if rs not in prices:
                prices.append(rs)

        all_numbers = re.findall(r'(?<!\d)(\d{3,4})(?!\d)', block)
        date_num = date_match.group(1) if date_match else None
        for n in all_numbers:
            if n != date_num and n not in identified_comm_nums and n not in prices:
                if n.endswith('0') or n.endswith('5') or int(n) > 200:
                    prices.append(n)

        names = []
        for line in lines:
            if re.search(id_pattern, line):
                match1 = re.search(r"([\u4e00-\u9fa5]{2,4})\s+" + id_pattern, line)
                if match1:
                    names.append(match1.group(1))
                    continue
                match2 = re.search(id_pattern + r"\s+([\u4e00-\u9fa5]{2,4})", line)
                if match2:
                    names.append(match2.group(1))
                    continue
                found_names = re.findall(r"[\u4e00-\u9fa5]{2,4}", line)
                for n in found_names:
                    if n not in ["连坐", "一张", "佣金", "备注", "票价"]:
                        names.append(n)
                        break
        
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
