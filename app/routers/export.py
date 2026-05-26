import os
import json
import sqlite3
import io
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse

router = APIRouter()

# 数据库路径：优先从环境变量读取，默认 /app/data/stock.db
DB_PATH = os.environ.get("DB_PATH", "/app/data/stock.db")


def _get_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _check_db_exists():
    if not os.path.exists(DB_PATH):
        return False
    return True


@router.get("/api/export/db/sql")
async def export_db_sql():
    """将 SQLite 数据库导出为 SQL 文件（使用 conn.iterdump()）"""
    if not _check_db_exists():
        return JSONResponse(
            status_code=404,
            content={"status": "error", "msg": f"数据库文件不存在: {DB_PATH}"}
        )

    timestamp = _get_timestamp()
    filename = f"stock_backup_{timestamp}.sql"

    def generate_sql():
        try:
            conn = sqlite3.connect(DB_PATH)
            for line in conn.iterdump():
                yield line + "\n"
            conn.close()
        except Exception as e:
            yield f"-- 导出错误: {e}\n"

    return StreamingResponse(
        generate_sql(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/api/export/db/json")
async def export_db_json():
    """将 SQLite 数据库所有表导出为 JSON 文件"""
    if not _check_db_exists():
        return JSONResponse(
            status_code=404,
            content={"status": "error", "msg": f"数据库文件不存在: {DB_PATH}"}
        )

    timestamp = _get_timestamp()
    filename = f"stock_backup_{timestamp}.json"

    def generate_json():
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 获取所有表名
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
            tables = [row[0] for row in cursor.fetchall()]

            result = {}
            for table in tables:
                cursor.execute(f"SELECT * FROM \"{table}\"")
                rows = cursor.fetchall()
                result[table] = [dict(row) for row in rows]

            conn.close()
            yield json.dumps(result, ensure_ascii=False, indent=2)
        except Exception as e:
            yield json.dumps({"status": "error", "msg": str(e)}, ensure_ascii=False)

    return StreamingResponse(
        generate_json(),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/api/export/db/info")
async def export_db_info():
    """获取数据库统计信息（表数、各表行数、文件大小等）"""
    if not _check_db_exists():
        return JSONResponse(
            status_code=404,
            content={"status": "error", "msg": f"数据库文件不存在: {DB_PATH}"}
        )

    try:
        file_size = os.path.getsize(DB_PATH)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 获取所有表名
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = [row[0] for row in cursor.fetchall()]

        table_info = {}
        total_rows = 0
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM \"{table}\"")
            count = cursor.fetchone()[0]
            table_info[table] = count
            total_rows += count

        conn.close()

        return {
            "status": "success",
            "db_path": DB_PATH,
            "file_size_bytes": file_size,
            "file_size_kb": round(file_size / 1024, 2),
            "file_size_mb": round(file_size / 1024 / 1024, 4),
            "table_count": len(tables),
            "total_rows": total_rows,
            "tables": table_info,
            "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "msg": f"读取数据库信息失败: {str(e)}"}
        )
