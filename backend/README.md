# 知食校园 - 后端服务

基于 Python FastAPI 的 AI 智能食堂推荐后端。

## 技术栈
- **Web 框架**: FastAPI
- **数据库**: SQLite（本地）/ MongoDB（云数据库部署）
- **ORM**: SQLAlchemy（异步）
- **认证**: JWT
- **AI**: 大模型 API（DeepSeek / 通义千问 / Kimi / 智谱）

## 快速启动

### 1. 安装依赖
```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入：
# - AI_API_KEY: 大模型 API 密钥
# - WECHAT_APPID / WECHAT_SECRET: 微信小程序配置
# - ADMIN_USERNAME / ADMIN_PASSWORD: 管理后台账号
```

### 3. 初始化数据库（导入示例菜品）
```bash
python -m app.seed_data
```

### 4. 启动服务
```bash
python run.py
# 或
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

服务启动后访问：
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 项目结构
```
backend/
├── app/
│   ├── main.py            # 应用入口
│   ├── config.py          # 配置管理
│   ├── database.py        # 数据库连接
│   ├── seed_data.py       # 种子数据
│   ├── models/            # 数据模型
│   │   ├── user.py
│   │   ├── dish.py
│   │   └── review.py
│   ├── schemas/           # Pydantic 请求/响应模型
│   ├── api/               # API 路由
│   │   ├── auth.py        # 认证
│   │   ├── dishes.py      # 菜品
│   │   ├── reviews.py     # 评价
│   │   ├── recommend.py   # AI推荐
│   │   ├── admin.py       # 管理后台
│   │   └── stats.py       # 数据统计
│   └── services/
│       ├── auth_service.py
│       └── ai_service.py  # AI推荐核心
├── requirements.txt
├── .env.example
└── run.py
```

## API 接口

### 认证
- `POST /api/auth/wechat-login` - 微信登录
- `POST /api/auth/admin-login` - 管理员登录
- `GET /api/auth/me` - 获取用户信息
- `PUT /api/auth/me` - 更新用户信息

### 菜品
- `GET /api/dishes/list` - 菜品列表（搜索/筛选）
- `GET /api/dishes/{id}` - 菜品详情
- `GET /api/dishes/rank/hot` - 今日热门榜
- `GET /api/dishes/rank/good` - 高分红榜
- `GET /api/dishes/rank/new` - 新品尝鲜
- `POST /api/dishes` - 新增菜品（管理员）
- `PUT /api/dishes/{id}` - 更新菜品（管理员）
- `DELETE /api/dishes/{id}` - 下架菜品（管理员）

### 评价
- `GET /api/reviews/list` - 评价列表
- `POST /api/reviews` - 发布评价
- `GET /api/reviews/mine` - 我的评价
- `GET /api/reviews/pending` - 待审核评价（管理员）
- `POST /api/reviews/audit` - 审核评价（管理员）

### AI 推荐
- `POST /api/recommend` - AI 智能推荐

### 管理后台
- `GET /api/admin/users` - 用户列表
- `POST /api/admin/users/{id}/ban` - 封禁/解封用户
- `GET /api/admin/dishes/all` - 全部菜品
- `GET /api/stats/overview` - 数据概览
- `GET /api/stats/top-dishes` - 高频推荐菜品
- `GET /api/stats/canteen-stats` - 食堂统计

## AI 推荐说明

AI 推荐服务通过 Prompt 工程实现：
1. 从数据库查询符合预算和食堂范围的候选菜品
2. 将用户偏好（口味、忌口、预算）和菜品列表构建成 Prompt
3. 调用大模型 API，要求返回结构化 JSON
4. 解析结果并返回推荐菜品及推荐理由
5. 若大模型不可用，自动降级为本地规则推荐

## 默认管理账号
- 账号: `admin`
- 密码: `admin123`

（可在 `.env` 中修改 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`）
