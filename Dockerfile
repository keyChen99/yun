# 阶段 1: 构建前端
FROM node:20-slim AS frontend-builder
WORKDIR /build
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 阶段 2: 运行后端
FROM python:3.11-slim
WORKDIR /app

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制后端依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 从阶段 1 复制前端编译产物
COPY --from=frontend-builder /build/dist ./dist

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动指令
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
