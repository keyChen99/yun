"""
数据库导出 API 路由
提供数据库备份下载功能
"""

from fastapi import APIRouter, FileResponse
from fastapi.responses import JSONResponse
import sqlite3
import json
import os
from datetime import datetime
from pathlib import Path

router = APIRouter(prefix="/api/export", tags=["export"])

DB_PATH = os.getenv("DB_PATH", "/app/data/stock.db")

@router.get("/db/sql")
async def export_sql():
    """导出数据库为 SQL 文件"""
    try:
        if not Path(DB_PATH).exists():
            return JSONResponse({"error": "数据库文件不存在"}, status_code=404)
        
        conn = sqlite3.connect(DB_PATH)
        sql_content = "\n".join(conn.iterdump())
        conn.close()
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"stock_backup_{timestamp}.sql"
        
        return FileResponse(
            content=sql_content.encode('utf-8'),
            media_type="text/plain",
            filename=filename
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/db/json")
async def export_json():
    """导出数据库为 JSON 文件"""
    try:
        if not Path(DB_PATH).exists():
            return JSONResponse({"error": "数据库文件不存在"}, status_code=404)
        
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 获取所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = cursor.fetchall()
        
        data = {}
        for table in tables:
            table_name = table[0]
            rows = cursor.execute(f"SELECT * FROM {table_name}").fetchall()
            data[table_name] = [dict(row) for row in rows]
        
        conn.close()
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"stock_backup_{timestamp}.json"
        
        return FileResponse(
            content=json.dumps(data, indent=2, ensure_ascii=False, default=str).encode('utf-8'),
            media_type="application/json",
            filename=filename
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/db/info")
async def get_db_info():
    """获取数据库信息"""
    try:
        if not Path(DB_PATH).exists():
            return JSONResponse({"error": "数据库文件不存在"}, status_code=404)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 获取所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = cursor.fetchall()
        
        table_info = {}
        total_rows = 0
        
        for table in tables:
            table_name = table[0]
            count = cursor.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            table_info[table_name] = count
            total_rows += count
        
        conn.close()
        
        file_size = Path(DB_PATH).stat().st_size
        
        return {
            "db_path": DB_PATH,
            "file_size_kb": round(file_size / 1024, 2),
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "total_tables": len(table_info),
            "total_rows": total_rows,
            "tables": table_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

