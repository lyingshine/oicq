# OICQ 客户端

这是一个基于Electron的仿QQ2008风格即时通讯客户端应用，提供经典的QQ界面和现代的通讯功能。

## 功能特点

- 经典的QQ2008风格界面
- 用户登录和注册系统
- 好友列表与管理
- 实时聊天功能
- 消息提醒与通知
- 系统托盘集成
- 个性化设置（头像、签名等）
- 状态更新（在线、离线、隐身等）
- 窗口置顶功能

## 安装与运行

### 前置要求

- Node.js 14.0.0 或更高版本
- npm 6.0.0 或更高版本

### 安装依赖

```bash
# 安装所有依赖
npm install
```

### 启动应用

```bash
# 启动Electron应用
npm start
```

> 注意：启动客户端前，请确保服务端已经启动并正常运行。

## 依赖项

```json
{
  "dependencies": {
    "electron-store": "^8.1.0",  // 本地数据存储
    "axios": "^1.6.2",           // HTTP客户端
    "ws": "^8.14.2",             // WebSocket客户端
    "iconv-lite": "^0.6.3"       // 字符编码转换
  },
  "devDependencies": {
    "electron": "^27.1.3",       // Electron框架
    "electron-reloader": "^1.2.3" // 开发热重载
  }
}
```

## 文件结构

```
client/
  ├── assets/            # 静态资源
  │   └── logo.png       # 应用图标
  ├── styles/            # CSS样式
  │   ├── common.css     # 通用样式
  │   └── pages/         # 页面特定样式
  │       ├── login.css
  │       ├── register.css
  │       ├── main.css
  │       ├── chat.css
  │       └── add-friend.css
  ├── renderer/          # 渲染进程脚本
  │   ├── login.js       # 登录页面脚本
  │   ├── register.js    # 注册页面脚本
  │   ├── main.js        # 主界面脚本
  │   ├── chat.js        # 聊天窗口脚本
  │   └── add-friend.js  # 添加好友页面脚本
  ├── sound/             # 声音资源
  │   ├── 上线提示音.mp3
  │   ├── 信息提示音.mp3
  │   └── 加好友提示.mp3
  ├── vendor/            # 第三方库
  │   └── fontawesome/   # 图标库
  ├── login.html         # 登录页面
  ├── register.html      # 注册页面
  ├── main.html          # 主界面
  ├── chat.html          # 聊天窗口
  ├── add-friend.html    # 添加好友页面
  ├── main.js            # 主进程文件
  └── preload.js         # 预加载脚本
```

## 主要功能模块

### 用户认证

- 用户登录与注册
- 账号切换功能
- 自动登录功能

### 主界面

- 好友列表显示
- 好友状态实时更新
- 个人资料设置
- 添加好友功能
- 好友请求管理

### 聊天功能

- 实时消息发送与接收
- 聊天历史记录
- 未读消息提醒
- 窗口置顶功能

### 系统集成

- 系统托盘图标
- 消息通知
- 声音提醒
- 窗口管理

## 技术实现

### 主进程与渲染进程通信

客户端使用Electron的IPC（进程间通信）机制实现主进程与渲染进程之间的通信：

```javascript
// 主进程中
ipcMain.handle('login', async (event, username, password) => {
  // 处理登录逻辑
});

// 渲染进程中（通过preload.js暴露）
window.electronAPI.login(username, password);
```

### 与服务端通信

- 使用Axios进行HTTP请求
- 使用WebSocket实现实时通信

### 数据存储

使用electron-store进行本地数据存储，保存用户设置、缓存等信息。

### 界面设计

- 使用HTML和CSS实现经典QQ2008风格界面
- 使用FontAwesome提供图标支持
- 自定义窗口边框和标题栏

## 开发指南

### 添加新功能

1. 在主进程（main.js）中添加相应的处理函数
2. 在预加载脚本（preload.js）中暴露API
3. 在渲染进程中调用API

### 调试技巧

- 使用`electron-reloader`实现热重载
- 使用Electron的开发者工具进行调试
- 查看应用日志排查问题

## 常见问题

1. **无法连接服务器**：确保服务端已启动，且地址配置正确（默认为localhost:3000）
2. **中文显示乱码**：项目已处理中文编码，如有问题请检查系统编码设置
3. **无法接收消息**：检查WebSocket连接是否正常，可能需要重新连接 