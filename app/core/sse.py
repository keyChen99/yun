import asyncio
from typing import Set

# 用于管理 SSE 连接的客户端队列
clients: Set[asyncio.Queue] = set()

async def notify_clients(message: str):
    for queue in list(clients):
        try:
            queue.put_nowait(message)
        except Exception:
            pass
