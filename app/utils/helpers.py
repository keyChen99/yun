import re

def extract_machine_code(text: str) -> str:
    """
    从字符串中提取机器码。
    示例: "(1062694)-Taoxin" -> "1062694"
    """
    if not text:
        return ""
    
    # 优先匹配括号内的数字
    match = re.search(r'\((\d+)\)', text)
    if match:
        return match.group(1)
    
    # 兜底：如果没括号，尝试找纯数字串
    match = re.search(r'(\d+)', text)
    if match:
        return match.group(1)
        
    return text.strip()
