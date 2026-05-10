import sqlite3
import json
import os
import re
from datetime import datetime

# 数据库文件路径处理
# 优先从环境变量读取（用于 Railway 等云平台持久化挂载），否则默认保存在项目根目录
DB_FILE = os.environ.get("DB_PATH")
if not DB_FILE:
    DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "stock.db")

# 确保数据库所在目录存在
db_dir = os.path.dirname(DB_FILE)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

def get_db():
    # 增加 timeout 参数（单位秒），防止数据库忙时直接报错，提高并发稳定性
    conn = sqlite3.connect(DB_FILE, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

# 1. 演唱会库存操作
def init_concerts_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS concerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            data TEXT,
            updated_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

def save_concert(concert_dict):
    init_concerts_db()
    conn = get_db()
    cursor = conn.cursor()
    # 确保 dict 中有 id，如果没有则生成
    if "id" not in concert_dict:
        concert_dict["id"] = int(datetime.now().timestamp() * 1000)
        
    cursor.execute(
        "INSERT INTO concerts (name, data, updated_at) VALUES (?, ?, ?)",
        (concert_dict["name"], json.dumps(concert_dict, ensure_ascii=False), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    # 获取刚刚插入的 ID 并更新到 JSON 中（如果需要同步数据库 ID）
    last_id = cursor.lastrowid
    cursor.execute("SELECT id FROM concerts WHERE rowid = ?", (last_id,))
    db_id = cursor.fetchone()["id"]
    concert_dict["id"] = db_id # 使用数据库自增 ID
    
    conn.commit()
    conn.close()

# 4. 票务系统操作
def init_ticketing_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets_sys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT,
            show_date TEXT,
            viewers TEXT,
            quantity INTEGER,
            price TEXT,
            status TEXT DEFAULT '待抢',
            notes TEXT,
            added_time TEXT,
            config_code TEXT
        )
    ''')
    # 检查字段是否存在（针对旧数据库迁移）
    cursor.execute("PRAGMA table_info(tickets_sys)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'show_date' not in columns:
        cursor.execute("ALTER TABLE tickets_sys ADD COLUMN show_date TEXT")
    if 'config_code' not in columns:
        cursor.execute("ALTER TABLE tickets_sys ADD COLUMN config_code TEXT")
        
    conn.commit()
    conn.close()

def save_ticket_sys(show_name, viewers, quantity, price, notes, show_date='', status='待抢', config_code=''):
    init_ticketing_db()
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO tickets_sys (show_name, show_date, viewers, quantity, price, notes, status, added_time, config_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (show_name, show_date, viewers, quantity, price, notes, status, added_time, config_code)
    )
    conn.commit()
    conn.close()

def save_tickets_bulk(items):
    """批量保存票务数据"""
    init_ticketing_db()
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 构造插入数据
    data = []
    for item in items:
        data.append((
            item.get("show_name"),
            item.get("show_date", ""),
            item.get("viewers"),
            item.get("quantity", 1),
            item.get("price"),
            item.get("notes"),
            item.get("status", "待抢"),
            added_time,
            item.get("config_code", "")
        ))
    
    cursor.executemany(
        "INSERT INTO tickets_sys (show_name, show_date, viewers, quantity, price, notes, status, added_time, config_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        data
    )
    conn.commit()
    conn.close()
    return len(items)

def get_all_tickets_sys(search=None, show_name=None, viewer=None, status=None):
    init_ticketing_db()
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM tickets_sys WHERE 1=1"
    params = []
    
    if search:
        query += " AND (show_name LIKE ? OR viewers LIKE ? OR show_date LIKE ? OR config_code LIKE ?)"
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%'])
    
    if show_name:
        query += " AND show_name LIKE ?"
        params.append(f'%{show_name}%')
        
    if viewer:
        query += " AND viewers LIKE ?"
        params.append(f'%{viewer}%')
        
    if status:
        query += " AND status = ?"
        params.append(status)
        
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_ticket_status(ticket_id, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE tickets_sys SET status = ? WHERE id = ?", (status, ticket_id))
    conn.commit()
    conn.close()

def update_ticket_sys(ticket_id, show_name, show_date, viewers, quantity, price, notes, status, config_code=''):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE tickets_sys SET show_name = ?, show_date = ?, viewers = ?, quantity = ?, price = ?, notes = ?, status = ?, config_code = ? WHERE id = ?",
        (show_name, show_date, viewers, quantity, price, notes, status, config_code, ticket_id)
    )
    conn.commit()
    conn.close()

def delete_ticket_sys(ticket_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tickets_sys WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()

def delete_tickets_bulk(ticket_ids):
    """批量删除票务数据"""
    if not ticket_ids:
        return 0
    conn = get_db()
    cursor = conn.cursor()
    # 使用 IN 语法批量删除
    placeholders = ', '.join(['?'] * len(ticket_ids))
    cursor.execute(f"DELETE FROM tickets_sys WHERE id IN ({placeholders})", ticket_ids)
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count

def clear_all_tickets_sys():
    """清空所有票务数据"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tickets_sys")
    conn.commit()
    conn.close()

def get_all_concerts():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, data FROM concerts ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    result = []
    for row in rows:
        item = json.loads(row["data"])
        item["id"] = row["id"] # 使用数据库自增 ID 替换原来的时间戳 ID，确保兼容性
        result.append(item)
    return result

def delete_concert(db_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM concerts WHERE id = ?", (db_id,))
    conn.commit()
    conn.close()

# 2. 观影人操作
def save_viewer_group(group_key, members_list, desc, added_time=None):
    if not added_time:
        added_time = datetime.now().strftime("%m-%d %H:%M:%S")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO viewers (group_key, members, desc, added_time) VALUES (?, ?, ?, ?)",
        (group_key, json.dumps(members_list, ensure_ascii=False), desc, added_time)
    )
    conn.commit()
    conn.close()

def get_all_viewers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT group_key, members, desc, added_time FROM viewers ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{
        "group_key": row["group_key"],
        "members": json.loads(row["members"]),
        "desc": row["desc"],
        "added_time": row["added_time"]
    } for row in rows]

def save_viewers_batch(viewer_list):
    conn = get_db()
    cursor = conn.cursor()
    for item in viewer_list:
        # 检查是否存在
        cursor.execute("SELECT id FROM viewers WHERE group_key = ?", (item["group_key"],))
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE viewers SET members = ?, desc = ? WHERE group_key = ?",
                (json.dumps(item["members"], ensure_ascii=False), item["desc"], item["group_key"])
            )
        else:
            cursor.execute(
                "INSERT INTO viewers (group_key, members, desc, added_time) VALUES (?, ?, ?, ?)",
                (item["group_key"], json.dumps(item["members"], ensure_ascii=False), item["desc"], item.get("added_time") or datetime.now().strftime("%m-%d %H:%M:%S"))
            )
    conn.commit()
    conn.close()

def delete_viewer(group_key):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM viewers WHERE group_key = ?", (group_key,))
    conn.commit()
    conn.close()

def clear_viewers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM viewers")
    conn.commit()
    conn.close()

# 3. ID 列表操作
def save_id_project(itemId, title, url, tickets, added_time=None):
    if not added_time:
        added_time = datetime.now().strftime("%m-%d %H:%M:%S")
    conn = get_db()
    cursor = conn.cursor()
    
    # 保存项目
    cursor.execute(
        "INSERT OR REPLACE INTO id_projects (itemId, title, url, added_time) VALUES (?, ?, ?, ?)",
        (itemId, title, url, added_time)
    )
    
    # 查找现有票价 ID 并去重插入
    cursor.execute("SELECT ticketId FROM id_tickets WHERE itemId = ?", (itemId,))
    existing_tids = {row["ticketId"] for row in cursor.fetchall()}
    
    for ticket in tickets:
        if ticket["ticketId"] not in existing_tids:
            cursor.execute(
                "INSERT INTO id_tickets (ticketId, itemId, info) VALUES (?, ?, ?)",
                (ticket["ticketId"], itemId, ticket["info"])
            )
            
    conn.commit()
    conn.close()

def get_id_projects():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT itemId, title, url, added_time FROM id_projects ORDER BY added_time DESC")
    projects = []
    project_rows = cursor.fetchall()
    
    for row in project_rows:
        itemId = row["itemId"]
        cursor.execute("SELECT ticketId, info FROM id_tickets WHERE itemId = ?", (itemId,))
        tickets = [{"ticketId": t["ticketId"], "info": t["info"]} for t in cursor.fetchall()]
        projects.append({
            "itemId": itemId,
            "title": row["title"],
            "url": row["url"],
            "tickets": tickets,
            "added_time": row["added_time"]
        })
    conn.close()
    return projects

def delete_id_project(itemId):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM id_projects WHERE itemId = ?", (itemId,))
    cursor.execute("DELETE FROM id_tickets WHERE itemId = ?", (itemId,))
    conn.commit()
    conn.close()

# 5. 知识库：学习已知的演出名称
def init_known_patterns_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS known_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT UNIQUE,
            added_time TEXT
        )
    ''')
    conn.commit()
    conn.close()

def learn_show_names(parsed_data):
    """从成功的 AI 解析结果中学习演出名称"""
    if not parsed_data or not isinstance(parsed_data, list):
        return
    
    init_known_patterns_db()
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    for item in parsed_data:
        show_name = item.get("show_name")
        if show_name and show_name != "未知演出":
            try:
                cursor.execute(
                    "INSERT OR IGNORE INTO known_patterns (show_name, added_time) VALUES (?, ?)",
                    (show_name, added_time)
                )
            except:
                pass
    
    conn.commit()
    conn.close()

def get_known_show_names():
    """获取所有已记录的演出名称"""
    init_known_patterns_db()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT show_name FROM known_patterns ORDER BY id DESC")
        rows = cursor.fetchall()
        return [row["show_name"] for row in rows]
    except:
        return []
    finally:
        conn.close()

# 6. 虚拟号表操作
def init_virtual_numbers_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS virtual_numbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT,
            link TEXT,
            usage_count INTEGER DEFAULT 0,
            cancellation_count INTEGER DEFAULT 0,
            notes TEXT,
            mobile TEXT DEFAULT '',
            machine_code TEXT DEFAULT '',
            added_time TEXT,
            sms_code TEXT DEFAULT ''
        )
    ''')
    # 检查并增加新字段（针对旧数据库迁移）
    cursor.execute("PRAGMA table_info(virtual_numbers)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'sms_code' not in columns:
        cursor.execute("ALTER TABLE virtual_numbers ADD COLUMN sms_code TEXT DEFAULT ''")
    if 'cancellation_count' not in columns:
        cursor.execute("ALTER TABLE virtual_numbers ADD COLUMN cancellation_count INTEGER DEFAULT 0")
    if 'mobile' not in columns:
        cursor.execute("ALTER TABLE virtual_numbers ADD COLUMN mobile TEXT DEFAULT ''")
    if 'machine_code' not in columns:
        cursor.execute("ALTER TABLE virtual_numbers ADD COLUMN machine_code TEXT DEFAULT ''")
    
    # 增加索引以优化搜索和排序性能
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vn_phone ON virtual_numbers(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vn_id_desc ON virtual_numbers(id DESC)")
    
    # 7. 手机号库表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mobile_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE
        )
    ''')
    
    # 8. 快捷复制工具配置表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quick_copy_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT DEFAULT '',
            bg_color TEXT DEFAULT ''
        )
    ''')

    # 9. 演出日程表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS show_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT NOT NULL,
            sale_time TEXT NOT NULL,
            added_time TEXT
        )
    ''')
    
    # 初始内置手机号
    initial_mobiles = [
        "15766293482", "18924324503", "13580434409", "17645900644",
        "15307442649", "18057676124", "18948240133", "15112024025"
    ]
    for m in initial_mobiles:
        cursor.execute("INSERT OR IGNORE INTO mobile_library (phone) VALUES (?)", (m,))

    # 初始内置快捷工具
    initial_tools = [
        ("复制百炼Key", "sk-28cd9015679f4a05a781342b7765a7c5", "", ""),
        ("复制滑块Key", "bviaowehfoi3of2h4i3goi", "", ""),
        ("爱加速账号", "15766293482", "", ""),
        ("爱加速密码", "cgfcgf243243", "", ""),
        ("快捷初始化", "uMwzIYbR", "#fff", "#722ed1"),
        ("补丁码", "b6b397080a8e4a5d8825e6f77a29ce4e", "#fff", "#fa8c16")
    ]
    cursor.execute("SELECT COUNT(*) FROM quick_copy_tools")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO quick_copy_tools (label, content, color, bg_color) VALUES (?, ?, ?, ?)", initial_tools)

    conn.commit()
    conn.close()

def get_quick_copy_tools():
    """获取快捷工具列表"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quick_copy_tools ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_quick_copy_tool(label, content, color='', bg_color=''):
    """新增快捷工具"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO quick_copy_tools (label, content, color, bg_color) VALUES (?, ?, ?, ?)", 
                  (label, content, color, bg_color))
    conn.commit()
    conn.close()
    return True

def update_quick_copy_tool(tool_id, label, content, color='', bg_color=''):
    """更新快捷工具"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE quick_copy_tools SET label = ?, content = ?, color = ?, bg_color = ? WHERE id = ?", 
                  (label, content, color, bg_color, tool_id))
    conn.commit()
    conn.close()
    return True

def delete_quick_copy_tool(tool_id):
    """删除快捷工具"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM quick_copy_tools WHERE id = ?", (tool_id,))
    conn.commit()
    conn.close()
    return True

def get_mobile_library():
    """获取手机号库列表"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT phone FROM mobile_library ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]

def add_to_mobile_library(phone):
    """添加手机号到库"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO mobile_library (phone) VALUES (?)", (phone,))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()

def delete_from_mobile_library(phone):
    """从库中删除手机号"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM mobile_library WHERE phone = ?", (phone,))
    conn.commit()
    conn.close()

def move_mobile_to_top(phone):
    """将手机号置顶（通过修改 ID 实现，简单有效）"""
    conn = get_db()
    cursor = conn.cursor()
    # 找到当前最小的 ID
    cursor.execute("SELECT MIN(id) FROM mobile_library")
    min_id = cursor.fetchone()[0] or 0
    # 将目标号码的 ID 改为最小 ID - 1
    cursor.execute("UPDATE mobile_library SET id = ? WHERE phone = ?", (min_id - 1, phone))
    conn.commit()
    conn.close()
    return True

def update_virtual_number_notes(item_id, notes):
    """更新虚拟号备注"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET notes = ? WHERE id = ?", (notes, item_id))
    conn.commit()
    conn.close()

def update_virtual_number_mobile(item_id, mobile):
    """更新虚拟号手机号，支持查重：如果别的项存在完全一致的“类型-手机号”，则删除旧项"""
    conn = get_db()
    cursor = conn.cursor()
    
    deleted_count = 0
    mobile = mobile.strip()
    if mobile:
        # 查重：严格匹配“类型-手机号”全名
        cursor.execute("SELECT id FROM virtual_numbers WHERE mobile = ? AND id != ?", (mobile, item_id))
        duplicates = cursor.fetchall()
        
        if duplicates:
            # 删除旧项
            duplicate_ids = [row[0] for row in duplicates]
            placeholders = ', '.join(['?'] * len(duplicate_ids))
            cursor.execute(f"DELETE FROM virtual_numbers WHERE id IN ({placeholders})", duplicate_ids)
            deleted_count = cursor.rowcount
            
    # 更新当前项
    cursor.execute("UPDATE virtual_numbers SET mobile = ? WHERE id = ?", (mobile, item_id))
    conn.commit()
    conn.close()
    return deleted_count

def update_virtual_number_machine_code(item_id, machine_code):
    """更新虚拟号机器码"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET machine_code = ? WHERE id = ?", (machine_code, item_id))
    conn.commit()
    conn.close()
    return True

def claim_virtual_number(machine_code):
    """
    供 RPA 调用的核心逻辑：
    1. 寻找可用号码：机器码为空 且 注销次数 < 3
    2. 排序规则：使用次数最小优先（0次优先，其次1次...），同次数下 ID 最小优先
    3. 找到后自动锁定：将传入的 machine_code 写入该记录
    4. 返回号码及链接
    """
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. 查找最合适的号码：机器码为空、注销次数 < 3 且 没有备注
    query = """
        SELECT id, phone, link, usage_count 
        FROM virtual_numbers 
        WHERE (machine_code = '' OR machine_code IS NULL) 
        AND cancellation_count < 3 
        AND (notes = '' OR notes IS NULL)
        ORDER BY usage_count ASC, id DESC 
        LIMIT 1
    """
    cursor.execute(query)
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    item_id = row["id"]
    result = {
        "id": item_id,
        "phone": row["phone"],
        "link": row["link"],
        "usage_count": row["usage_count"]
    }
    
    # 2. 自动写入机器码进行锁定，并增加使用次数
    cursor.execute("UPDATE virtual_numbers SET machine_code = ?, usage_count = MIN(3, usage_count + 1) WHERE id = ?", (machine_code, item_id))
    
    conn.commit()
    conn.close()
    return result

def update_virtual_number_sms(item_id, sms_code):
    """更新虚拟号验证码"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET sms_code = ? WHERE id = ?", (sms_code, item_id))
    conn.commit()
    conn.close()

def save_virtual_numbers_bulk(items):
    """批量保存虚拟号数据"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data = []
        for item in items:
            data.append((
                item.get("phone"),
                item.get("link"),
                item.get("usage_count", 0),
                item.get("notes", ""),
                added_time
            ))
        
        cursor.executemany(
            "INSERT INTO virtual_numbers (phone, link, usage_count, notes, added_time) VALUES (?, ?, ?, ?, ?)",
            data
        )
        conn.commit()
    finally:
        conn.close()
    return len(items)

def get_virtual_numbers_paginated(search=None, page=1, page_size=20, has_mobile=None, usage_count=None, cancellation_count=None):
    """支持搜索与分页的虚拟号查询，支持筛选是否有手机号、次数、注销数"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. 基础查询语句
        query = "SELECT * FROM virtual_numbers WHERE 1=1"
        count_query = "SELECT COUNT(*) FROM virtual_numbers WHERE 1=1"
        params = []
        
        # 2. 搜索条件 (根据号码、手机号或机器码搜索)
        if search:
            query += " AND (phone LIKE ? OR mobile LIKE ? OR machine_code LIKE ? OR notes LIKE ?)"
            count_query += " AND (phone LIKE ? OR mobile LIKE ? OR machine_code LIKE ? OR notes LIKE ?)"
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param, search_param])
            
        # 3. 筛选是否有手机号
        if has_mobile is True:
            query += " AND mobile != '' AND mobile IS NOT NULL"
            count_query += " AND mobile != '' AND mobile IS NOT NULL"
        elif has_mobile is False:
            query += " AND (mobile = '' OR mobile IS NULL)"
            count_query += " AND (mobile = '' OR mobile IS NULL)"

        # 4. 筛选次数
        if usage_count is not None:
            query += " AND usage_count = ?"
            count_query += " AND usage_count = ?"
            params.append(usage_count)

        # 5. 筛选注销数
        if cancellation_count is not None:
            query += " AND cancellation_count = ?"
            count_query += " AND cancellation_count = ?"
            params.append(cancellation_count)

        # 6. 获取总数
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        # 4. 分页与排序
        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        offset = (page - 1) * page_size
        params.extend([page_size, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return {
            "total": total,
            "items": [dict(row) for row in rows]
        }
    except Exception as e:
        print(f"DB Error (get_virtual_numbers_paginated): {e}")
        return {"total": 0, "items": []}

def get_all_virtual_numbers():
    """保留旧接口兼容性，默认获取前 1000 条"""
    return get_virtual_numbers_paginated(page_size=1000)["items"]

def delete_virtual_number(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM virtual_numbers WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def increment_usage_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET usage_count = MIN(3, usage_count + 1) WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def decrement_usage_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET usage_count = MAX(0, usage_count - 1) WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def increment_cancellation_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    # 增加注销数的同时，清除当前项的手机号和机器码存储
    cursor.execute("UPDATE virtual_numbers SET cancellation_count = MIN(3, (cancellation_count + 1)), mobile = '', machine_code = '' WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def get_used_mobile_numbers():
    """获取所有已分配的手机号列表（完整格式，如 优酷-157...）"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT mobile FROM virtual_numbers WHERE mobile != '' AND mobile IS NOT NULL")
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]

def get_vn_by_machine_code(machine_code):
    """根据机器码查找虚拟号记录"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM virtual_numbers WHERE machine_code = ?", (machine_code,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def assign_mobile_by_priority(item_id, machine_code):
    """
    为指定记录分配手机号：
    1. 获取手机号库
    2. 获取所有已分配的完整手机号字符串
    3. 优先级：优酷-xxx > 淘宝-xxx (同个手机号不同类型可重复分配)
    """
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. 获取手机号库
    cursor.execute("SELECT phone FROM mobile_library ORDER BY id ASC")
    library_phones = [row[0] for row in cursor.fetchall()]
    
    # 2. 获取所有已分配的完整手机号字符串
    cursor.execute("SELECT mobile FROM virtual_numbers WHERE mobile != '' AND mobile IS NOT NULL")
    all_assigned_mobiles = {row[0] for row in cursor.fetchall()}
    
    target_mobile = ""
    mobile_type = ""
    pure_phone = ""
    
    # 3. 优先尝试分配“优酷”
    for p in library_phones:
        yk_mobile = f"优酷-{p}"
        if yk_mobile not in all_assigned_mobiles:
            target_mobile = yk_mobile
            mobile_type = "优酷"
            pure_phone = p
            break
            
    # 4. 如果优酷都用完了，再尝试分配“淘宝”
    if not target_mobile:
        for p in library_phones:
            tb_mobile = f"淘宝-{p}"
            if tb_mobile not in all_assigned_mobiles:
                target_mobile = tb_mobile
                mobile_type = "淘宝"
                pure_phone = p
                break
                
    if target_mobile:
        cursor.execute("UPDATE virtual_numbers SET mobile = ? WHERE id = ?", (target_mobile, item_id))
        conn.commit()
        conn.close()
        return {"type": mobile_type, "phone": pure_phone}
        
    conn.close()
    return None

def decrement_cancellation_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET cancellation_count = MAX(0, (cancellation_count - 1)) WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def clear_all_virtual_numbers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM virtual_numbers")
    conn.commit()
    conn.close()

# 10. 演出日程操作
def init_show_schedules_db():
    init_virtual_numbers_db() # 实际上 init_virtual_numbers_db 已经包含了创建表逻辑

def get_all_show_schedules():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM show_schedules ORDER BY sale_time ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_show_schedule(show_name, sale_time):
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO show_schedules (show_name, sale_time, added_time) VALUES (?, ?, ?)",
        (show_name, sale_time, added_time)
    )
    conn.commit()
    conn.close()
    return True

def save_shows_bulk(items):
    """批量保存演出日程"""
    if not items:
        return 0
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data = [(item["show_name"], item["sale_time"], added_time) for item in items]
    cursor.executemany(
        "INSERT INTO show_schedules (show_name, sale_time, added_time) VALUES (?, ?, ?)",
        data
    )
    conn.commit()
    conn.close()
    return len(items)

def delete_show_schedule(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM show_schedules WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return True

def update_show_schedule(item_id, show_name, sale_time):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE show_schedules SET show_name = ?, sale_time = ? WHERE id = ?",
        (show_name, sale_time, item_id)
    )
    conn.commit()
    conn.close()
    return True
