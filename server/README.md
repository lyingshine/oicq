# OICQ 服务端

这是一个基于Express的IM服务端应用。

## 功能

- 用户注册和登录API
- 好友管理API
- 消息管理API
- 状态更新API

## 开发

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 开发模式启动（自动重载）
npm run dev
```

## 数据存储

服务器使用JSON文件作为简单数据库，存储在`db.json`中。

## API端点

- POST /api/register - 注册新用户
- POST /api/login - 用户登录
- GET /api/users/:qq - 获取用户信息
- 其他好友和消息相关API 