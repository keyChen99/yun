#!/usr/bin/env python3
"""
SQLite 数据库导出工具
导出 stock.db 为 SQL 文件或 JSON 文件
"""

import sqlite3
import json
import sys
from datetime import datetime
from pathlib import Path

def export_to_sql(db_path, output_path):
    """导出数据库为 SQL 文件"""
    try:
        conn = sqlite3.connect(db_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            for line in conn.iterdump():
                f.write(f'{line}\n')
        conn.close()
        print(f"✅ SQL 导出成功: {output_path}")
        return True
    except Exception as e:
        print(f"❌ SQL 导出失败: {e}")
        return False

def export_to_json(db_path, output_path):
    """导出数据库为 JSON 文件"""
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 获取所有表名
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        data = {}
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()
            data[table_name] = [dict(row) for row in rows]
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        
        conn.close()
        print(f"✅ JSON 导出成功: {output_path}")
        return True
    except Exception as e:
        print(f"❌ JSON 导出失败: {e}")
        return False

def get_db_info(db_path):
    """获取数据库信息"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 获取所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"\n📊 数据库信息: {db_path}")
        print(f"文件大小: {Path(db_path).stat().st_size / 1024:.2f} KB")
        print(f"\n表列表:")
        
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"  - {table_name}: {count} 行")
        
        conn.close()
    except Exception as e:
        print(f"❌ 获取数据库信息失败: {e}")

if __name__ == "__main__":
    db_path = "/app/data/stock.db"
    
    # 如果本地有 stock.db，使用本地的
    if Path("stock.db").exists():
        db_path = "stock.db"
    
    if not Path(db_path).exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        sys.exit(1)
    
    # 显示数据库信息
    get_db_info(db_path)
    
    # 生成时间戳
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # 导出为 SQL
    sql_output = f"stock_backup_{timestamp}.sql"
    export_to_sql(db_path, sql_output)
    
    # 导出为 JSON
    json_output = f"stock_backup_{timestamp}.json"
    export_to_json(db_path, json_output)
    
    print(f"\n✅ 导出完成！")
    print(f"SQL 文件: {sql_output}")
    print(f"JSON 文件: {json_output}")

