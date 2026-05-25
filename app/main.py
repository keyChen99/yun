import os
import asyncio
import logging
from fastapi import FastAPI, Request

# 配置基础日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("正在加载应用模块...")

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import AUTH_PASSWORD, SUB_ADMIN_PASSWORD, WECHAT_ONLY_PASSWORD, ROLE_PERMISSIONS, is_local_ip
from app.core.sse import clients
from app.database import db_manager as db
from app.routers import concerts, viewers, ticketing, virtual_numbers, idlist, rpa, shows, wechat

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
    db.init_wechat_db()
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

# 权限控制中间件
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # 公开路径列表
    public_paths = [
        "/",
        "/health",
        "/api/auth",
        "/api/auth/check",
        "/assets",
        "/favicon.ico"
    ]
    
    path = request.url.path
    
    # 检查是否是公开路径
    is_public = any(path == p or path.startswith(p + "/") for p in public_paths)
    
    # 如果是 API 请求且不是公开路径，则检查授权
    if path.startswith("/api/") and not is_public:
        auth_token = request.headers.get("Authorization")
        
        # 验证密码是否存在于权限配置中
        if auth_token not in ROLE_PERMISSIONS:
            return JSONResponse(
                status_code=401,
                content={"status": "error", "msg": "未授权访问，请先登录"}
            )
            
        # 权限校验
        permissions = ROLE_PERMISSIONS[auth_token]
        if "all" not in permissions:
            # 检查当前路径是否在允许的 API 列表中
            is_allowed_api = any(path.startswith(allowed_api) for allowed_api in permissions)
            if not is_allowed_api:
                return JSONResponse(
                    status_code=403,
                    content={"status": "error", "msg": "权限不足，无法访问该功能"}
                )
            
    response = await call_next(request)
    return response

@app.post("/api/auth")
async def check_auth(request: Request):
    payload = await request.json()
    password = payload.get("password")
    if password in ROLE_PERMISSIONS:
        role = "admin"
        if password == SUB_ADMIN_PASSWORD:
            role = "sub_admin"
        elif password == WECHAT_ONLY_PASSWORD:
            role = "wechat_only"
            
        # 返回该角色的权限范围
        return {
            "status": "success", 
            "role": role,
            "permissions": ROLE_PERMISSIONS[password]
        }
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

# 挂载路由
from app.routers import concerts, viewers, ticketing, virtual_numbers, idlist, rpa, shows, wechat
app.include_router(concerts.router)
app.include_router(viewers.router)
app.include_router(ticketing.router)
app.include_router(virtual_numbers.router)
app.include_router(idlist.router)
app.include_router(rpa.router)
app.include_router(shows.router)
app.include_router(wechat.router)

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
    try:
        logger.info("收到首页访问请求")
        target_file = "dist/index.html"
        
        if os.path.exists(target_file):
            return FileResponse(target_file)
        
        # 兜底方案：如果 dist 不存在，尝试返回根目录的 index.html
        if os.path.exists("index.html"):
            logger.warning("dist/index.html 缺失，使用根目录 index.html")
            return FileResponse("index.html")
            
        return {"status": "ok", "message": "Backend is running. Frontend build missing."}
    except Exception as e:
        logger.error(f"首页渲染异常: {e}")
        return {"status": "error", "message": str(e)}
