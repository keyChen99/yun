import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import AUTH_PASSWORD, is_local_ip
from app.core.sse import clients
from app.database import db_manager as db
from app.routers import concerts, viewers, ticketing, virtual_numbers, idlist, rpa, shows

# 初始化 FastAPI 应用
app = FastAPI()

# 初始化数据库
db.init_ticketing_db()
db.init_concerts_db()
db.init_virtual_numbers_db()
db.init_known_patterns_db()
db.init_show_schedules_db()

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
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

@app.get("/")
async def read_index():
    target_file = "dist/index.html" if os.path.exists("dist/index.html") else "index.html"
    return FileResponse(target_file, headers={
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    })

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
