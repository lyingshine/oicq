# QQ2008 Vue客户端

这是使用Vue.js重构的QQ2008风格即时通讯客户端应用。

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

## 技术栈

- **Vue.js 3**: 前端框架
- **Vuex**: 状态管理
- **Vue Router**: 路由管理
- **Electron**: 桌面应用框架
- **Axios**: HTTP客户端
- **WebSocket**: 实时通信

## 安装与运行

### 前置要求

- Node.js 14.0.0 或更高版本
- npm 6.0.0 或更高版本

### 安装依赖

```bash
# 安装所有依赖
npm install
```

### 开发模式

```bash
# 启动开发服务器
npm run electron:serve
```

### 构建生产版本

```bash
# 构建应用
npm run electron:build
```

## 项目结构

```
vue-client/
  ├── public/           # 静态资源
  │   ├── vendor/       # 第三方库
  │   │   ├── fontawesome/ # 图标库
  │   │   └── webfonts/ # 字体文件
  │   └── index.html    # HTML模板
  ├── src/              # 源代码
  │   ├── assets/       # 资源文件
  │   │   └── sound/    # 声音资源
  │   ├── components/   # Vue组件
  │   ├── router/       # 路由配置
  │   ├── store/        # Vuex存储
  │   ├── styles/       # CSS样式
  │   │   ├── common.css # 通用样式
  │   │   └── pages/    # 页面特定样式
  │   ├── views/        # 页面组件
  │   ├── App.vue       # 根组件
  │   └── main.js       # 入口文件
  ├── background.js     # Electron主进程
  └── preload.js        # 预加载脚本
```

## 与原版的区别

本项目是对原始QQ2008客户端的Vue重构版本，保持了原有的功能和UI设计，但使用了现代前端框架Vue.js进行重构，主要改进包括：

1. 组件化开发：使用Vue组件拆分界面
2. 状态管理：使用Vuex集中管理应用状态
3. 路由管理：使用Vue Router处理页面导航
4. 响应式设计：利用Vue的响应式特性优化用户体验

## 注意事项

- 本应用需要配合服务端一起使用
- 确保服务端在启动客户端前已经运行
- 默认连接到localhost:3000，如需修改请更新background.js中的API_URL 