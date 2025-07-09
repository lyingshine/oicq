# QQ2008 聊天应用

一个基于Electron的仿QQ2008风格即时通讯应用，提供了经典的QQ界面和基础通讯功能。

## 项目说明

本项目是一个桌面聊天应用，采用Electron框架开发，前端使用HTML、CSS和JavaScript实现，服务端采用Express框架。项目旨在重现经典的QQ2008界面风格，同时提供现代化的聊天功能。

## 功能特点

- 经典的QQ2008界面风格
- 用户注册与登录系统
- 联系人列表管理
- 个性化设置（头像、签名等）
- 实时聊天功能
- 多账号切换

## 安装步骤

### 前端安装

```bash
# 克隆仓库
git clone [仓库地址]

# 进入项目目录
cd oicq

# 安装依赖
npm install

# 启动应用
npm start
```

### 服务端安装

```bash
# 进入服务端目录
cd server

# 安装服务端依赖
npm install

# 启动服务器
node index.js
```

## 技术栈

- **前端**: Electron, HTML, CSS, JavaScript
- **后端**: Node.js, Express
- **数据存储**: JSON文件 (db.json)
- **HTTP客户端**: Axios

## 项目结构

```
oicq/
  ├── assets/            # 资源文件（图标、图片等）
  ├── styles/            # CSS样式文件
  ├── vendor/            # 第三方库（FontAwesome等）
  ├── server/            # 服务端代码
  │   ├── db.json        # 数据存储
  │   └── index.js       # 服务器入口文件
  ├── login.html         # 登录页面
  ├── register.html      # 注册页面
  ├── main.html          # 主界面
  ├── main.js            # 主进程文件
  ├── preload.js         # 预加载脚本
  └── package.json       # 项目配置
```

## 使用方法

1. 启动服务端：进入server目录，运行`node index.js`
2. 启动客户端：在项目根目录运行`npm start`
3. 通过登录界面进入系统，或注册新账号
4. 在主界面可以查看联系人、修改个性化设置等

## 开发说明

- 使用`electron-reloader`支持热重载开发
- 数据存储在`server/db.json`中
- 客户端与服务端通过HTTP API通信 