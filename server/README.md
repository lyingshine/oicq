# OICQ 服务端

这是一个基于Express和WebSocket的即时通讯服务端应用，为QQ2008风格的客户端提供后端支持。

## 功能特点

- 用户注册和登录系统
- 好友管理（添加、接受、拒绝请求）
- 实时消息传递（WebSocket）
- 用户状态管理
- 聊天历史记录存储
- 简单的JSON文件数据库

## 安装与运行

### 前置要求

- Node.js 14.0.0 或更高版本
- npm 6.0.0 或更高版本

### 安装依赖

```bash
# 安装所有依赖
npm install
```

### 启动服务

```bash
# 正常启动
npm start

# 开发模式启动（自动重载）
npm run dev
```

## 依赖项

```json
{
  "dependencies": {
    "express": "^4.18.2",     // Web服务框架
    "body-parser": "^1.20.2",  // 请求体解析
    "cors": "^2.8.5",          // 跨域资源共享
    "ws": "^8.14.2",           // WebSocket服务
    "axios": "^1.6.2",         // HTTP客户端
    "iconv-lite": "^0.6.3"     // 字符编码转换
  },
  "devDependencies": {
    "nodemon": "^3.0.1"        // 开发热重载
  }
}
```

## 数据存储

服务器使用JSON文件作为简单数据库，存储在`db.json`中。数据结构如下：

```json
{
  "users": {
    "用户QQ号": {
      "nickname": "用户昵称",
      "password": "密码",
      "avatar": "头像数据",
      "signature": "个性签名",
      "status": "在线状态",
      "friends": ["好友QQ号列表"],
      "friendRequestsSent": ["已发送请求的QQ号"],
      "friendRequestsReceived": ["收到请求的QQ号"]
    }
  },
  "lastQQ": 10000,        // 最后分配的QQ号
  "nicknames": {          // 昵称到QQ号的映射
    "用户昵称": "QQ号"
  },
  "messages": {           // 消息存储
    "聊天ID": [
      {
        "sender": "发送者QQ",
        "content": "消息内容",
        "timestamp": "时间戳",
        "messageId": "消息ID",
        "read": true/false
      }
    ]
  }
}
```

## API端点

### 用户管理

- `POST /api/register` - 注册新用户
  - 请求体: `{ nickname, password }`
  - 响应: `{ success, qq }`

- `POST /api/login` - 用户登录
  - 请求体: `{ username, password }`
  - 响应: `{ success, message, user }`

- `GET /api/users/:qq` - 获取用户信息
  - 响应: `{ success, user }`

- `PUT /api/users/:qq` - 更新用户信息
  - 请求体: `{ nickname, signature, avatar }`
  - 响应: `{ success, message }`

### 好友管理

- `GET /api/users/:qq/friends` - 获取好友列表
  - 响应: `{ success, friends }`

- `POST /api/friend-requests` - 发送好友请求
  - 请求体: `{ senderQq, recipientQq }`
  - 响应: `{ success, message }`

- `POST /api/friend-requests/:requesterId/accept` - 接受好友请求
  - 请求体: `{ userQq }`
  - 响应: `{ success, message }`

- `POST /api/friend-requests/:requesterId/reject` - 拒绝好友请求
  - 请求体: `{ userQq }`
  - 响应: `{ success, message }`

### 用户搜索

- `GET /api/users/search` - 搜索用户
  - 查询参数: `term, currentUserQq`
  - 响应: `{ success, users }`

### WebSocket通信

服务器在HTTP服务器的基础上创建WebSocket服务器，处理以下事件：

- 用户连接与断开
- 消息发送与接收
- 用户状态更新
- 好友请求通知

## 错误处理

服务端实现了全局错误处理中间件，统一处理API错误并返回适当的响应。

## 开发说明

- 使用`nodemon`实现开发环境下的自动重载
- 实现了日志系统，支持不同级别的日志输出
- 针对Windows平台做了特殊处理，避免中文乱码问题 