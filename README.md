# QQ2008 聊天应用

一个基于Electron的仿QQ2008风格即时通讯应用，提供了经典的QQ界面和基础通讯功能。

## 项目说明

本项目是一个桌面聊天应用，采用Electron框架开发，前端使用HTML、CSS和JavaScript实现，服务端采用Express框架。项目旨在重现经典的QQ2008界面风格，同时提供现代化的聊天功能。

## 功能特点

- 经典的QQ2008界面风格
- 用户注册与登录系统
- 联系人列表管理
- 好友添加与管理
- 个性化设置（头像、签名等）
- 实时聊天功能
- 消息提醒与通知
- 系统托盘集成
- 多账号切换

## 安装步骤

### 前置要求

- Node.js 14.0.0 或更高版本
- npm 6.0.0 或更高版本

### 安装依赖

项目分为客户端和服务端两部分，需要分别安装依赖：

```bash
# 克隆仓库
git clone https://github.com/yourusername/oicq.git
cd oicq

# 安装服务端依赖
cd server
npm install

# 安装客户端依赖
cd ../client
npm install
```

### 启动应用

需要分别启动服务端和客户端：

```bash
# 启动服务端（在server目录下）
npm start

# 启动客户端（在client目录下）
npm start
```

## 技术栈

- **前端**: 
  - Electron (桌面应用框架)
  - HTML5, CSS3, JavaScript
  - electron-store (本地数据存储)
  - WebSocket (实时通信)

- **后端**: 
  - Node.js
  - Express (Web服务框架)
  - WebSocket (实时通信服务)
  - JSON文件存储 (简单数据库)

## 项目结构

项目采用客户端和服务端完全分离的结构：

```
oicq/
  ├── client/            # 客户端代码
  │   ├── assets/        # 资源文件（图标、图片等）
  │   ├── styles/        # CSS样式文件
  │   │   ├── common.css # 通用样式
  │   │   └── pages/     # 页面特定样式
  │   ├── vendor/        # 第三方库（FontAwesome等）
  │   ├── renderer/      # 渲染进程脚本
  │   ├── sound/         # 声音资源
  │   ├── login.html     # 登录页面
  │   ├── register.html  # 注册页面
  │   ├── main.html      # 主界面
  │   ├── chat.html      # 聊天窗口
  │   ├── add-friend.html# 添加好友页面
  │   ├── main.js        # 主进程文件
  │   ├── preload.js     # 预加载脚本
  │   └── package.json   # 客户端配置
  ├── server/            # 服务端代码
  │   ├── db.json        # 数据存储
  │   ├── index.js       # 服务器入口文件
  │   └── package.json   # 服务端配置
  └── package.json       # 项目根配置
```

## 使用方法

1. 启动服务端和客户端
2. 在登录界面注册新账号或使用已有账号登录
3. 主界面中可以：
   - 查看和管理好友列表
   - 修改个人资料和状态
   - 添加新好友
   - 打开聊天窗口
4. 聊天窗口支持：
   - 发送和接收文本消息
   - 查看聊天历史记录
   - 窗口置顶功能

## 开发说明

### 客户端

- 使用`electron-reloader`支持热重载开发
- 使用`electron-store`进行本地数据存储
- 通过WebSocket与服务端保持实时连接
- 支持系统托盘和消息通知

### 服务端

- 使用Express提供HTTP API
- 使用WebSocket提供实时通信
- 数据存储在`db.json`文件中
- 支持用户认证、好友管理和消息传递

## 依赖项管理

### 服务端依赖

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "ws": "^8.14.2",
    "axios": "^1.6.2",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### 客户端依赖

```json
{
  "dependencies": {
    "electron-store": "^8.1.0",
    "axios": "^1.6.2",
    "ws": "^8.14.2",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "electron": "^27.1.3",
    "electron-reloader": "^1.2.3"
  }
}
```

## 常见问题

1. **启动失败**：确保已安装所有依赖，且服务端在客户端之前启动
2. **连接问题**：默认服务端运行在localhost:3000，确保该端口未被占用
3. **中文显示问题**：项目已处理中文编码，如有问题请检查系统编码设置

## 贡献指南

欢迎提交Pull Request或Issue来改进这个项目。在提交代码前，请确保：

1. 代码风格一致
2. 添加必要的注释
3. 测试功能正常

## 许可证

MIT 