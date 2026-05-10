import os
import asyncio
import logging
from fastapi import FastAPI, Request

# 配置基础日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("正在加载应用模块...")

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import AUTH_PASSWORD, is_local_ip
from app.core.sse import clients
from app.database import db_manager as db
from app.routers import concerts, viewers, ticketing, virtual_numbers, idlist, rpa, shows

# 初始化 FastAPI 应用
print("正在启动 FastAPI 应用...")
app = FastAPI()

try:
    # 初始化数据库
    print("正在初始化数据库...")
    db.init_ticketing_db()
    db.init_concerts_db()
    db.init_virtual_numbers_db()
    db.init_known_patterns_db()
    db.init_show_schedules_db()
    print("数据库初始化完成。")
except Exception as e:
    print(f"数据库初始化失败: {e}")
    # 继续启动，或者根据需要抛出异常


# 解决跨域问题
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
from app.routers import concerts, viewers, ticketing, virtual_numbers, idlist, rpa, shows
app.include_router(concerts.router)
app.include_router(viewers.router)
app.include_router(ticketing.router)
app.include_router(virtual_numbers.router)
app.include_router(idlist.router)
app.include_router(rpa.router)
app.include_router(shows.router)

# 挂载 Vite 构建的静态资源
if os.path.exists("dist"):
    assets_path = "dist/assets"
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    else:
        logger.warning(f"目录 {assets_path} 不存在，跳过挂载静态资源")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": asyncio.get_event_loop().time()}

@app.get("/")
async def read_index():
    logger.info("收到首页访问请求")
    
    # 打印当前目录下存在的文件，帮助调试
    current_files = os.listdir(".")
    logger.info(f"当前目录文件列表: {current_files}")
    if "dist" in current_files:
        logger.info(f"dist 目录内容: {os.listdir('dist')}")

    # 严格检查编译后的文件
    target_file = "dist/index.html"
    if os.path.exists(target_file):
        logger.info(f"成功找到编译后的文件: {target_file}")
        return FileResponse(target_file, headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
        })
    
    logger.error("!!! 关键错误: 未找到 dist/index.html，说明前端构建可能失败了 !!!")
    return {
        "status": "error", 
        "msg": "前端构建产物丢失", 
        "debug_info": {
            "current_dir": os.getcwd(),
            "files": current_files
        }
    }



@app.post("/api/auth")
async def check_auth(request: Request):
    payload = await request.json()
    password = payload.get("password")
    if password == AUTH_PASSWORD:
        return {"status": "success"}
    return {"status": "error", "msg": "密码错误"}

@app.get("/api/auth/check")
async def auth_check(request: Request):
    client_ip = request.client.host
    if is_local_ip(client_ip):
        return {"status": "success", "is_local": True}
    return {"status": "auth_required", "is_local": False}

@app.get("/api/events")
async def event_stream(request: Request):
    queue = asyncio.Queue()
    clients.add(queue)
    
    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=10.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    
        finally:
            clients.discard(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
