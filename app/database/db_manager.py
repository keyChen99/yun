import sqlite3
import json
import os
import re
import shutil
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

# 自动迁移逻辑：如果持久化目录中没有数据库，尝试从项目根目录拷贝初始数据库
REPO_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "stock.db")
if os.environ.get("DB_PATH") and not os.path.exists(DB_FILE) and os.path.exists(REPO_DB):
    try:
        shutil.copy2(REPO_DB, DB_FILE)
        print(f"成功将初始数据库从 {REPO_DB} 迁移至 {DB_FILE}")
    except Exception as e:
        print(f"数据库迁移失败: {e}")

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
def init_idlist_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS id_projects (
            itemId TEXT PRIMARY KEY,
            title TEXT,
            url TEXT,
            added_time TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS id_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticketId TEXT,
            itemId TEXT,
            info TEXT,
            FOREIGN KEY (itemId) REFERENCES id_projects (itemId)
        )
    ''')
    conn.commit()
    conn.close()

def save_id_project(itemId, title, url, tickets, added_time=None):
    init_idlist_db()
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
    init_idlist_db() # 确保表存在
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT itemId, title, url, added_time FROM id_projects ORDER BY added_time DESC")
    projects = []
    project_rows = cursor.fetchall()
    
    for row in project_rows:
        itemId = row["itemId"]
        cursor.execute("SELECT ticketId, info FROM id_tickets WHERE itemId = ?", (itemId,))
        tickets = [dict(t) for t in cursor.fetchall()]
        project = dict(row)
        project["tickets"] = tickets
        projects.append(project)
    
    conn.close()
    return projects

def delete_id_project(itemId):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM id_tickets WHERE itemId = ?", (itemId,))
    cursor.execute("DELETE FROM id_projects WHERE itemId = ?", (itemId,))
    conn.commit()
    conn.close()

def update_id_project_title(itemId, title):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE id_projects SET title = ? WHERE itemId = ?", (title, itemId))
    conn.commit()
    conn.close()

def init_known_patterns_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS known_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT UNIQUE
        )
    ''')
    conn.commit()
    conn.close()

def get_known_show_names():
    init_known_patterns_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT show_name FROM known_patterns")
    rows = cursor.fetchall()
    conn.close()
    return [row["show_name"] for row in rows]

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
            machine_code TEXT,
            mobile TEXT,
            notes TEXT,
            added_time TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mobile_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            priority INTEGER DEFAULT 0
        )
    ''')
    # 检查字段是否存在（针对旧数据库迁移）
    cursor.execute("PRAGMA table_info(virtual_numbers)")
    vn_columns = [row[1] for row in cursor.fetchall()]
    if 'sms_code' not in vn_columns:
        cursor.execute("ALTER TABLE virtual_numbers ADD COLUMN sms_code TEXT")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mobile_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            priority INTEGER DEFAULT 0
        )
    ''')
    # 检查字段是否存在（针对旧数据库迁移）
    cursor.execute("PRAGMA table_info(mobile_library)")
    lib_columns = [row[1] for row in cursor.fetchall()]
    if 'priority' not in lib_columns:
        cursor.execute("ALTER TABLE mobile_library ADD COLUMN priority INTEGER DEFAULT 0")
        
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quick_copy_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT,
            template TEXT,
            color TEXT,
            bg_color TEXT
        )
    ''')
    # 检查字段是否存在
    cursor.execute("PRAGMA table_info(quick_copy_tools)")
    qc_columns = [row[1] for row in cursor.fetchall()]
    if 'color' not in qc_columns:
        cursor.execute("ALTER TABLE quick_copy_tools ADD COLUMN color TEXT")
    if 'bg_color' not in qc_columns:
        cursor.execute("ALTER TABLE quick_copy_tools ADD COLUMN bg_color TEXT")

    conn.commit()
    conn.close()

def init_show_schedules_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS show_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT,
            sale_time TEXT,
            added_time TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_all_show_schedules():
    init_show_schedules_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM show_schedules ORDER BY sale_time ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_show_schedule(show_name, sale_time):
    init_show_schedules_db()
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO show_schedules (show_name, sale_time, added_time) VALUES (?, ?, ?)",
        (show_name, sale_time, added_time)
    )
    conn.commit()
    conn.close()

def save_shows_bulk(items):
    init_show_schedules_db()
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

def update_show_schedule(item_id, show_name, sale_time):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE show_schedules SET show_name = ?, sale_time = ? WHERE id = ?",
        (show_name, sale_time, item_id)
    )
    conn.commit()
    conn.close()

def delete_show_schedule(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM show_schedules WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def claim_virtual_number(machine_code):
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. 检查该机器码是否已经绑定了号码
    cursor.execute("SELECT * FROM virtual_numbers WHERE machine_code = ?", (machine_code,))
    row = cursor.fetchone()
    if row:
        conn.close()
        return dict(row)
    
    # 2. 找一个未绑定的号码（优先使用 usage_count 较小的）
    cursor.execute("SELECT * FROM virtual_numbers WHERE machine_code IS NULL OR machine_code = '' ORDER BY usage_count ASC, id ASC LIMIT 1")
    row = cursor.fetchone()
    if row:
        record_id = row["id"]
        cursor.execute("UPDATE virtual_numbers SET machine_code = ?, usage_count = usage_count + 1 WHERE id = ?", (machine_code, record_id))
        conn.commit()
        # 重新读取完整数据
        cursor.execute("SELECT * FROM virtual_numbers WHERE id = ?", (record_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row)
    
    conn.close()
    return None

def get_vn_by_machine_code(machine_code):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM virtual_numbers WHERE machine_code = ?", (machine_code,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def increment_cancellation_count(record_id):
    conn = get_db()
    cursor = conn.cursor()
    # 注销逻辑：次数+1，同时清空机器码和分配的手机号
    cursor.execute("UPDATE virtual_numbers SET cancellation_count = cancellation_count + 1, machine_code = NULL, mobile = NULL WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()

def get_virtual_numbers_paginated(search=None, page=1, page_size=20, has_mobile=None, usage_count=None, cancellation_count=None):
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM virtual_numbers WHERE 1=1"
    params = []
    
    if search:
        query += " AND (phone LIKE ? OR machine_code LIKE ? OR notes LIKE ? OR mobile LIKE ?)"
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%'])
    
    if has_mobile is True:
        query += " AND (mobile IS NOT NULL AND mobile != '')"
    elif has_mobile is False:
        query += " AND (mobile IS NULL OR mobile = '')"

    if usage_count is not None:
        query += " AND usage_count = ?"
        params.append(usage_count)

    if cancellation_count is not None:
        query += " AND cancellation_count = ?"
        params.append(cancellation_count)

    # 计算总数
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]
    
    # 分页
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([page_size, (page - 1) * page_size])
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    return {
        "total": total,
        "items": [dict(row) for row in rows]
    }

def save_virtual_numbers_bulk(items):
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    added_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data = []
    for item in items:
        data.append((item["phone"], item["link"], item.get("usage_count", 0), item.get("notes", ""), added_time))
    
    cursor.executemany(
        "INSERT INTO virtual_numbers (phone, link, usage_count, notes, added_time) VALUES (?, ?, ?, ?, ?)",
        data
    )
    conn.commit()
    conn.close()
    return len(items)

def delete_virtual_number(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM virtual_numbers WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def increment_usage_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET usage_count = usage_count + 1 WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def decrement_usage_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET usage_count = MAX(0, usage_count - 1) WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def get_used_mobile_numbers():
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT mobile FROM virtual_numbers WHERE mobile IS NOT NULL AND mobile != ''")
    rows = cursor.fetchall()
    conn.close()
    return [row["mobile"] for row in rows]

def get_mobile_library():
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT phone FROM mobile_library ORDER BY priority DESC, id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [row["phone"] for row in rows]

def add_to_mobile_library(phone):
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO mobile_library (phone) VALUES (?)", (phone,))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def delete_from_mobile_library(phone):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM mobile_library WHERE phone = ?", (phone,))
    conn.commit()
    conn.close()

def move_mobile_to_top(phone):
    conn = get_db()
    cursor = conn.cursor()
    # 获取当前最大优先级并+1
    cursor.execute("SELECT MAX(priority) FROM mobile_library")
    max_p = cursor.fetchone()[0] or 0
    cursor.execute("UPDATE mobile_library SET priority = ? WHERE phone = ?", (max_p + 1, phone))
    conn.commit()
    conn.close()

def decrement_cancellation_count(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET cancellation_count = MAX(0, cancellation_count - 1) WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

def update_virtual_number_notes(item_id, notes):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET notes = ? WHERE id = ?", (notes, item_id))
    conn.commit()
    conn.close()

def update_virtual_number_mobile(item_id, mobile):
    conn = get_db()
    cursor = conn.cursor()
    # 更新手机号
    cursor.execute("UPDATE virtual_numbers SET mobile = ? WHERE id = ?", (mobile, item_id))
    
    # 自动清理：如果该手机号在其他记录中也存在（且不是当前这条），则删除旧的记录，保持手机号唯一性（业务逻辑可选）
    deleted_count = 0
    if mobile:
        cursor.execute("DELETE FROM virtual_numbers WHERE mobile = ? AND id != ?", (mobile, item_id))
        deleted_count = cursor.rowcount
        
    conn.commit()
    conn.close()
    return deleted_count

def update_virtual_number_machine_code(item_id, machine_code):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET machine_code = ? WHERE id = ?", (machine_code, item_id))
    conn.commit()
    conn.close()

def update_virtual_number_sms(item_id, sms_code):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE virtual_numbers SET sms_code = ? WHERE id = ?", (sms_code, item_id))
    conn.commit()
    conn.close()

def clear_all_virtual_numbers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM virtual_numbers")
    conn.commit()
    conn.close()

def get_quick_copy_tools():
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    # 检查字段名
    cursor.execute("PRAGMA table_info(quick_copy_tools)")
    columns = [row[1] for row in cursor.fetchall()]
    
    # 动态构建 SQL，兼容 template 或 content 字段
    content_field = "template" if "template" in columns else "content"
    query = f"SELECT id, label, {content_field} as content, color, bg_color FROM quick_copy_tools ORDER BY id ASC"
    
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_quick_copy_tool(label, content, color='', bg_color=''):
    init_virtual_numbers_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO quick_copy_tools (label, template, color, bg_color) VALUES (?, ?, ?, ?)",
        (label, content, color, bg_color)
    )
    conn.commit()
    conn.close()

def update_quick_copy_tool(tool_id, label, content, color='', bg_color=''):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE quick_copy_tools SET label = ?, template = ?, color = ?, bg_color = ? WHERE id = ?",
        (label, content, color, bg_color, tool_id)
    )
    conn.commit()
    conn.close()

def delete_quick_copy_tool(tool_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM quick_copy_tools WHERE id = ?", (tool_id,))
    conn.commit()
    conn.close()
