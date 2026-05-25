import os
import re
from datetime import datetime, timedelta, timezone

def get_now_cst() -> datetime:
    """获取中国标准时间 (UTC+8)"""
    tz_cst = timezone(timedelta(hours=8))
    return datetime.now(tz_cst)

# 授权密码配置
AUTH_PASSWORD = "248248"  # 超级管理员：访问全部内容
SUB_ADMIN_PASSWORD = "124124"  # 子管理员：访问 ID 列表、配置演出、查看观影人
WECHAT_ONLY_PASSWORD = "666666"  # 微信专员：仅访问微信列表

# 权限配置
ROLE_PERMISSIONS = {
    AUTH_PASSWORD: ["all"],
    SUB_ADMIN_PASSWORD: ["/api/idlist", "/api/shows", "/api/viewers", "/api/auth"],
    WECHAT_ONLY_PASSWORD: ["/api/wechat", "/api/auth"]
}

# AI 相关配置
AI_API_KEY = os.getenv("AI_API_KEY", "sk-zgclqbwmmqjcccdtlzlbjsutzkuiycbujyxzlxmmjrdywucz")
AI_BASE_URL = "https://api.siliconflow.cn/v1"
AI_MODEL = "deepseek-ai/DeepSeek-V3"

# 正则表达式
ID_PATTERN = r"[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]"
PAIR_RE = re.compile(rf"([\u4e00-\u9fa5]{{2,8}})\s*({ID_PATTERN})")
REVERSE_PAIR_RE = re.compile(rf"({ID_PATTERN})\s*([\u4e00-\u9fa5]{{2,8}})")
NAME_LABEL_RE = re.compile(r"^(?:姓名|名字)\s*[:：]\s*([\u4e00-\u9fa5]{2,8})\s*$")
ID_LABEL_RE = re.compile(r"^(?:身份证|身份证号)\s*[:：]\s*(" + ID_PATTERN + r")\s*$")
PURE_NAME_RE = re.compile(r"^[\u4e00-\u9fa5]{2,8}$")
PURE_ID_RE = re.compile(r"^" + ID_PATTERN + r"$")
SEPARATOR_LINE_RE = re.compile(r"^[\-—_=~\u2500-\u257f\u23af\u30fc\uFF0D]{3,}$")

def is_local_ip(ip: str) -> bool:
    return ip in ["127.0.0.1", "localhost", "::1"]
