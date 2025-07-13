'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
import path from 'path'
import { fileURLToPath } from 'url'
import Store from 'electron-store'
import axios from 'axios'
import WebSocket from 'ws'
import iconv from 'iconv-lite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDevelopment = process.env.NODE_ENV !== 'production'

// 设置缓存目录
app.setPath('userData', path.join(__dirname, 'userData'))
app.setPath('cache', path.join(__dirname, 'cache'))

// 创建统一的日志管理系统
const logger = {
  isEnabled: process.env.NODE_ENV !== 'production',
  
  // 自定义日志级别
  levels: {
    INFO: 'INFO',
    ERROR: 'ERROR',
    WARN: 'WARN',
    DEBUG: 'DEBUG'
  },
  
  // 自定义输出函数
  log(level, ...args) {
    if (!this.isEnabled) return
    
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level}]`
    
    if (level === this.levels.ERROR) {
      console.error(prefix, ...args)
    } else {
      console.log(prefix, ...args)
    }
  },
  
  // 便捷方法
  info(...args) { this.log(this.levels.INFO, ...args) },
  error(...args) { this.log(this.levels.ERROR, ...args) },
  warn(...args) { this.log(this.levels.WARN, ...args) },
  debug(...args) { this.log(this.levels.DEBUG, ...args) },
  
  // 完全禁用所有日志
  disable() {
    this.isEnabled = false
  },
  
  // 启用日志
  enable() {
    this.isEnabled = true
  }
}

// 在Windows平台上禁用日志以避免中文乱码问题
if (process.platform === 'win32') {
  logger.disable()
  
  // 处理底层stdout/stderr的写入
  const streams = [process.stdout, process.stderr]

  streams.forEach(stream => {
    const originalWrite = stream.write.bind(stream)
    stream.write = (chunk, encoding, callback) => {
      // 直接禁用输出
      if (callback) callback()
      return true
    }
  })
}

// 替换原始的console方法
console.log = (...args) => logger.info(...args)
console.error = (...args) => logger.error(...args)
console.warn = (...args) => logger.warn(...args)

const store = new Store()
const API_URL = 'http://localhost:3000/api'

// 声音类型
const SOUND_TYPES = {
  ONLINE: '上线提示音',
  MESSAGE: '信息提示音',
  FRIEND_REQUEST: '加好友提示'
}

// 系统托盘图标
let tray = null
let flashingInterval = null
let isIconFlashing = false
let unreadMessages = {}
let mainWindow = null
let ws = null

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 440,
    height: 330,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    mainWindow.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    mainWindow.loadURL('app://./index.html')
  }

  // 创建系统托盘
  createTray()
}

// 创建系统托盘图标
function createTray() {
  // 创建托盘图标
  const iconPath = path.join(__dirname, 'public', 'logo.png')
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  
  // 设置托盘图标的上下文菜单
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '打开主窗口', 
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      } 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        // 清理托盘图标
        if (tray) {
          tray.destroy()
          tray = null
        }
        
        // 清理闪烁定时器
        if (flashingInterval) {
          clearInterval(flashingInterval)
          flashingInterval = null
        }
        
        app.quit()
      } 
    }
  ])
  
  tray.setToolTip('QQ2008')
  tray.setContextMenu(contextMenu)
  
  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// 设置IPC处理程序
function setupIPC() {
  // 窗口控制
  ipcMain.on('minimize-window', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.minimize()
  })
  
  ipcMain.on('close-window', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.close()
  })
  
  // 用户认证
  ipcMain.handle('login', async (event, username, password) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password })
      const data = response.data
      
      if (data.success) {
        // 登录成功后连接WebSocket
        connectWebSocket()
      }
      
      return data
    } catch (error) {
      console.error('登录失败:', error)
      return { success: false, message: error.response?.data?.message || '登录失败' }
    }
  })
  
  ipcMain.handle('register', async (event, nickname, password) => {
    try {
      const response = await axios.post(`${API_URL}/register`, { nickname, password })
      return response.data
    } catch (error) {
      console.error('注册失败:', error)
      return { success: false, message: error.response?.data?.message || '注册失败' }
    }
  })
  
  // 更多IPC处理程序...
}

// 连接WebSocket
function connectWebSocket() {
  // 实现WebSocket连接逻辑...
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  
  // 设置IPC处理程序
  setupIPC()
  
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
} 