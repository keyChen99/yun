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
    # 优先检查 dist/index.html
    paths_to_check = ["dist/index.html", "index.html", "app/ui/index.html"]
    target_file = None
    
    for p in paths_to_check:
        if os.path.exists(p):
            target_file = p
            break
            
    if target_file:
        logger.info(f"返回文件: {target_file}")
        return FileResponse(target_file, headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
        })
    
    logger.warning("未找到任何 index.html 文件，返回临时状态页")
    return {"status": "online", "msg": "后端已启动，但前端静态文件尚未就绪，请检查构建日志。"}


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
