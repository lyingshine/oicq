try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const Store = require('electron-store'); // Still used for avatar path
const axios = require('axios');
const WebSocket = require('ws');
const iconv = require('iconv-lite');

// 设置缓存目录
app.setPath('userData', path.join(__dirname, 'userData'));
app.setPath('cache', path.join(__dirname, 'cache'));

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
        if (!this.isEnabled) return;
        
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}]`;
        
        if (level === this.levels.ERROR) {
            console.error(prefix, ...args);
        } else {
            console.log(prefix, ...args);
        }
    },
    
    // 便捷方法
    info(...args) { this.log(this.levels.INFO, ...args); },
    error(...args) { this.log(this.levels.ERROR, ...args); },
    warn(...args) { this.log(this.levels.WARN, ...args); },
    debug(...args) { this.log(this.levels.DEBUG, ...args); },
    
    // 完全禁用所有日志
    disable() {
        this.isEnabled = false;
    },
    
    // 启用日志
    enable() {
        this.isEnabled = true;
    }
};

// 在Windows平台上禁用日志以避免中文乱码问题
if (process.platform === 'win32') {
    logger.disable();
    
    // 处理底层stdout/stderr的写入
    const streams = [process.stdout, process.stderr];

    streams.forEach(stream => {
        const originalWrite = stream.write.bind(stream);
        stream.write = (chunk, encoding, callback) => {
            // 直接禁用输出
            if (callback) callback();
            return true;
        };
    });
}

// 替换原始的console方法
console.log = (...args) => logger.info(...args);
console.error = (...args) => logger.error(...args);
console.warn = (...args) => logger.warn(...args);

const store = new Store();
const API_URL = 'http://localhost:3000/api';

// 声音类型
const SOUND_TYPES = {
  ONLINE: '上线提示音',
  MESSAGE: '信息提示音',
  FRIEND_REQUEST: '加好友提示'
};

function wrapMethod(obj, method, wrapper) {
  const original = obj[method].bind(obj);
  obj[method] = wrapper(original);
}

function createWindow(options, file) {
  const defaultOptions = {
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  const win = new BrowserWindow({ ...defaultOptions, ...options });
  win.loadFile(file);
  return win;
}

// 系统托盘图标
let tray = null;
let flashingInterval = null;
let isIconFlashing = false;
let unreadMessages = {};

// 创建系统托盘图标
function createTray() {
  // 创建托盘图标
  const iconPath = path.join(__dirname, 'assets', 'logo.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  
  // 设置托盘图标的上下文菜单
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '打开主窗口', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      } 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        // 清理托盘图标
        if (tray) {
          tray.destroy();
          tray = null;
        }
        
        // 清理闪烁定时器
        if (flashingInterval) {
          clearInterval(flashingInterval);
          flashingInterval = null;
        }
        
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('QQ2008');
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 开始闪烁托盘图标
function startTrayIconFlashing() {
  if (isIconFlashing) return;
  
  isIconFlashing = true;
  let flashState = false;
  
  flashingInterval = setInterval(() => {
    if (!tray) return;
    
    const iconName = flashState ? 'logo.png' : 'logo_notification.png';
    const iconPath = path.join(__dirname, 'assets', iconName);
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray.setImage(trayIcon);
    
    flashState = !flashState;
  }, 500);
}

// 停止闪烁托盘图标
function stopTrayIconFlashing() {
  if (!isIconFlashing) return;
  
  if (flashingInterval) {
    clearInterval(flashingInterval);
    flashingInterval = null;
  }
  
  if (tray) {
    const iconPath = path.join(__dirname, 'assets', 'logo.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray.setImage(trayIcon);
  }
  
  isIconFlashing = false;
}

// 更新托盘图标提示文本
function updateTrayTooltip() {
  if (!tray) return;
  
  const unreadCount = Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
  if (unreadCount > 0) {
    tray.setToolTip(`QQ2008 - 有 ${unreadCount} 条未读消息`);
    startTrayIconFlashing();
  } else {
    tray.setToolTip('QQ2008');
    stopTrayIconFlashing();
  }
}

// 处理未读消息
function handleUnreadMessage(friendQq, increment = true) {
  if (!unreadMessages[friendQq]) {
    unreadMessages[friendQq] = 0;
  }
  
  if (increment) {
    unreadMessages[friendQq]++;
  }
  
  updateTrayTooltip();
}

// 清除好友的未读消息
function clearUnreadMessages(friendQq) {
  if (unreadMessages[friendQq]) {
    delete unreadMessages[friendQq];
    updateTrayTooltip();
  }
}

function showApp() {
  const winOptions = {
    width: 440,
    height: 330,
    show: false,
  };
  mainWindow = createWindow(winOptions, 'login.html');
  
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });
  
  // 创建系统托盘图标
  createTray();
  
  // 处理窗口关闭事件
  mainWindow.on('close', () => {
    // 允许窗口关闭，程序将退出
    if (tray) {
      tray.destroy();
      tray = null;
    }
    
    if (flashingInterval) {
      clearInterval(flashingInterval);
      flashingInterval = null;
    }
  });
}

// 播放声音
function playSound(type) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  let soundFile;
  switch(type) {
    case SOUND_TYPES.ONLINE:
      soundFile = '上线提示音.mp3';
      break;
    case SOUND_TYPES.MESSAGE:
      soundFile = '信息提示音.mp3';
      break;
    case SOUND_TYPES.FRIEND_REQUEST:
      soundFile = '加好友提示.mp3';
      break;
    default:
      console.error('未知的声音类型:', type);
      return;
  }
  
  const soundPath = path.join(__dirname, 'sound', soundFile);
  const soundUrl = pathToFileURL(soundPath).href;

  mainWindow.webContents.executeJavaScript(`
    (function(){
      const audio = new Audio('${soundUrl}');
      audio.play().catch(err => console.error('播放声音失败:', err));
    })();
  `, true);
}

let mainWindow;
let registerWindow;
let addFriendWindow;
let currentUserQq = null;

function createRegisterWindow() {
  if (registerWindow) {
    registerWindow.focus();
    return;
  }

  const winOptions = {
    width: 400,
    height: 450,
    parent: mainWindow,
    modal: true,
  };
  registerWindow = createWindow(winOptions, 'register.html');

  registerWindow.on('closed', () => {
    registerWindow = null;
  });
}

// 更新主窗口的好友请求计数
async function updateMainWindowRequestCount() {
    if (!currentUserQq || !mainWindow || mainWindow.isDestroyed()) {
        console.log('[清理] 更新好友请求计数失败: 当前用户或主窗口不存在');
        return;
    }

    try {
        console.log('[网络] 获取好友请求计数...');
        const response = await axios.get(`${API_URL}/friends/${currentUserQq}`);
        
        if (response.data.success && response.data.requests) {
            const count = response.data.requests.length;
            console.log(`[数据] 当前好友请求数量: ${count}`);

            if (!mainWindow.isDestroyed()) {
                console.log('[UI] 发送好友请求计数到渲染进程');
                mainWindow.webContents.send('friend-request-count', count);
                
                if (count > 0) {
                    console.log('[UI] 发送好友请求通知事件');
                    mainWindow.webContents.send('friend-request');
                    playSound(SOUND_TYPES.FRIEND_REQUEST);
                }
            }
        }
    } catch (error) {
        console.error('[网络错误] 更新好友请求计数失败:', error);
    }
}

function createAddFriendWindow() {
    if (addFriendWindow) {
        addFriendWindow.focus();
        return;
    }

    const winOptions = {
        width: 400,
      height: 400,
        parent: mainWindow,
        modal: true,
    };
      addFriendWindow = createWindow(winOptions, 'add-friend.html');

  addFriendWindow.webContents.on('did-finish-load', async () => {
        addFriendWindow.webContents.send('current-user-qq', currentUserQq);
    });

    addFriendWindow.on('closed', () => {
        addFriendWindow = null;
        // 关闭窗口后更新主窗口的好友请求计数
        updateMainWindowRequestCount();
    });
}

const handle = (channel, callback) => {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      console.log(`处理IPC请求: ${channel}`, args);
      const result = await callback(event, ...args);
      console.log(`IPC请求完成: ${channel}`, { success: result?.success });
      return result;
    } catch (error) {
      console.error(`IPC错误 (${channel}):`, error);
      // 确保返回一个标准格式的错误对象
      if (error.response) {
        return { 
            success: false, 
            message: error.response.data?.message || error.response.statusText || '服务器响应错误',
            statusCode: error.response.status 
        };
      } else if (error.request) {
        return { success: false, message: '无法连接到服务器' };
      } else {
        return { success: false, message: error.message || '发生未知错误' };
      }
    }
  });
};

// 消息系统
let ws = null;
let wsConnected = false;
let isReconnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const initialReconnectDelay = 1000; // 初始重连等待时间（1秒）
const maxReconnectDelay = 30000; // 最大重连等待时间（30秒）
let reconnectTimeout = null;
let heartbeatInterval = null;
const heartbeatPingInterval = 30000; // 30秒发送一次心跳

// 连接WebSocket
let wsConnecting = false; // 标记是否正在连接中

function connectWebSocket() {
  if (ws) {
    // 清理现有连接
    clearWebSocketEvents(ws);
    ws.close();
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    logger.warn('主窗口不存在，无法创建WebSocket连接');
    return;
  }

  const currentUserQq = store.get('currentUserQq');
  if (!currentUserQq) {
    logger.warn('用户未登录，不创建WebSocket连接');
    return;
  }

  try {
    logger.info(`尝试建立WebSocket连接，用户: ${currentUserQq}，尝试次数: ${reconnectAttempts + 1}`);
    ws = new WebSocket(`ws://localhost:3000?qq=${currentUserQq}`);

    // 设置WebSocket事件处理
    ws.on('open', () => {
      wsConnected = true;
      isReconnecting = false;
      reconnectAttempts = 0; // 重置重连计数
      logger.info('WebSocket连接已建立');

      // 发送上线通知
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'status',
            status: 'online',
            qq: currentUserQq
          }));
          logger.info('发送上线通知成功');
        } catch (error) {
          logger.error('发送上线通知失败:', error);
        }
      }

      // 开始发送心跳包
      startHeartbeat();
      
      // 处理消息队列（在连接成功后）
      setTimeout(processMessageQueue, 500);
    });

    ws.on('message', handleWebSocketMessage);

    ws.on('error', (error) => {
      logger.error('WebSocket错误:', error.message);
      if (!isReconnecting) {
        handleReconnect();
      }
    });

    ws.on('close', () => {
      wsConnected = false;
      logger.warn('WebSocket连接已关闭');
      clearInterval(heartbeatInterval);
      
      if (!isReconnecting) {
        handleReconnect();
      }
    });

  } catch (error) {
    logger.error('创建WebSocket连接时出错:', error);
    if (!isReconnecting) {
      handleReconnect();
    }
  }
}

// 清理WebSocket事件监听器
function clearWebSocketEvents(websocket) {
  if (!websocket) return;
  
  websocket.removeAllListeners('open');
  websocket.removeAllListeners('message');
  websocket.removeAllListeners('error');
  websocket.removeAllListeners('close');
}

// 启动心跳机制
function startHeartbeat() {
  // 清除可能存在的心跳定时器
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // 设置新的心跳定时器
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const heartbeatMessage = JSON.stringify({ type: 'heartbeat' });
        ws.send(heartbeatMessage);
        logger.debug('发送心跳包');
      } catch (error) {
        logger.error('发送心跳包失败:', error);
        // 如果发送心跳失败，尝试重连
        if (!isReconnecting) {
          handleReconnect();
        }
      }
    } else {
      logger.warn('心跳检测：WebSocket未连接');
      if (!isReconnecting) {
        handleReconnect();
      }
    }
  }, heartbeatPingInterval);
}

// 使用指数退避算法处理重连
function handleReconnect() {
  if (isReconnecting) return;
  
  isReconnecting = true;
  
  // 清除可能存在的重连定时器
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  
  // 如果超过最大重试次数，停止重连
  if (reconnectAttempts >= maxReconnectAttempts) {
    logger.error(`已达到最大重连尝试次数(${maxReconnectAttempts})，停止重连`);
    isReconnecting = false;
    return;
  }
  
  // 使用指数退避算法计算下次重连时间
  const delay = Math.min(
    initialReconnectDelay * Math.pow(2, reconnectAttempts),
    maxReconnectDelay
  );
  
  // 添加随机抖动，避免多客户端同时重连
  const jitter = 0.5 * Math.random();
  const finalDelay = Math.floor(delay * (1 + jitter));
  
  logger.warn(`WebSocket将在${finalDelay}毫秒后尝试重连，当前尝试次数: ${reconnectAttempts + 1}/${maxReconnectAttempts}`);
  
  reconnectTimeout = setTimeout(() => {
    reconnectAttempts++;
    connectWebSocket();
  }, finalDelay);
}

// 处理接收到的WebSocket消息
async function handleWebSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);
    
    // 处理心跳请求
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
      return;
    }
    
    // 处理消息接收确认
    if (data.type === 'message-received') {
      const { clientMessageId, serverMessageId } = data.payload;
      if (pendingMessages.has(clientMessageId)) {
        console.log(`[网络] 服务器已接收消息: ${clientMessageId}`);
        // 标记消息为已接收但未确认送达
        const pendingMsg = pendingMessages.get(clientMessageId);
        pendingMsg.serverMessageId = serverMessageId;
        pendingMsg.received = true;
        pendingMessages.set(clientMessageId, pendingMsg);
      }
      return;
    }
    
    // 处理消息送达确认
    if (data.type === 'message-delivered') {
      const { clientMessageId, serverMessageId } = data.payload;
      if (pendingMessages.has(clientMessageId)) {
        console.log(`[网络] 消息已送达: ${clientMessageId}`);
        // 消息已完成整个流程，可以从待处理列表中移除
        pendingMessages.delete(clientMessageId);
      }
      return;
    }
    
    // 处理消息存储失败
    if (data.type === 'message-store-failed') {
      const { clientMessageId } = data.payload;
      if (pendingMessages.has(clientMessageId)) {
        console.error(`[错误] 消息存储失败: ${clientMessageId}`);
        // 通知用户消息可能未保存
        const pendingMsg = pendingMessages.get(clientMessageId);
        if (pendingMsg.chatWindow && !pendingMsg.chatWindow.isDestroyed()) {
          pendingMsg.chatWindow.webContents.send('message-store-failed', {
            clientMessageId
          });
        }
        pendingMessages.delete(clientMessageId);
      }
      return;
    }
    
    // 处理好友状态更新
    if (data.type === 'friend-status-update') {
      const { qq, status } = data.payload;
      console.log(`[数据] 好友 ${qq} 状态更新为: ${status}`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('friend-status-update', { qq, status });
      }
      return;
    }
    
    // 处理好友上线
    if (data.type === 'friend-online') {
      const { qq } = data.payload;
      console.log(`[数据] 好友 ${qq} 上线了`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('friend-online', qq);
        playSound(SOUND_TYPES.ONLINE);
      }
      return;
    }
    
    // 处理新消息
    if (data.type === 'new-message') {
      const { id, sender, content, timestamp } = data.payload;
      
      console.log(`[数据] 收到来自 ${sender} 的新消息: ${content}`);
      
      // 立即确认消息接收
      try {
        ws.send(JSON.stringify({
          type: 'ack',
          messageId: id
        }));
      } catch (error) {
        console.error('[错误] 发送消息确认失败:', error);
      }
      
      // 播放消息提示音
      playSound(SOUND_TYPES.MESSAGE);
      
      // 处理未读消息
      handleUnreadMessage(sender);
      
      // 如果主窗口存在，通知有新消息
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('message-received', { 
          senderQq: sender
        });
      }
      
      // 如果聊天窗口打开，立即发送消息到聊天窗口
      if (chatWindows[sender]) {
        // 使用高优先级方式立即发送消息到渲染进程
        try {
          // 使用更高优先级发送消息
          setImmediate(() => {
            if (chatWindows[sender] && !chatWindows[sender].isDestroyed()) {
              chatWindows[sender].webContents.send('message-received', {
                message: content,
                senderQq: sender,
                timestamp,
                messageId: id
              });
            }
          });
          
          // 强制刷新窗口，确保消息显示
          chatWindows[sender].webContents.invalidate();
          
          // 如果聊天窗口是焦点窗口，则标记消息为已读
          if (chatWindows[sender].isFocused()) {
            clearUnreadMessages(sender);
            
            // 标记消息为已读
            try {
              ws.send(JSON.stringify({
                type: 'mark-read',
                userQq: currentUserQq,
                otherQq: sender
              }));
            } catch (error) {
              console.error('[错误] 标记消息为已读失败:', error);
            }
          }
        } catch (error) {
          console.error('[错误] 发送消息到聊天窗口失败:', error);
          
          // 尝试重新发送 - 使用更短的延迟
          setTimeout(() => {
            if (chatWindows[sender] && !chatWindows[sender].isDestroyed()) {
              chatWindows[sender].webContents.send('message-received', {
                message: content,
                senderQq: sender,
                timestamp,
                messageId: id
              });
            }
          }, 100);  // 缩短延迟时间
        }
      }
      return;
    }
    
    // 处理未读消息通知
    if (data.type === 'unread-messages') {
      console.log(`[数据] 收到未读消息通知:`, data.payload);
      
      // 更新未读消息计数
      unreadMessages = { ...data.payload };
      updateTrayTooltip();
      
      // 如果主窗口存在，通知有未读消息
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('unread-messages', data.payload);
      }
      return;
    }
  } catch (error) {
    console.error('[错误] 处理WebSocket消息失败:', error);
  }
}

// 添加消息缓存机制
const messageCache = {
  // 存储用户之间的消息历史
  history: {},
  // 存储待发送的消息队列
  queue: {},
  // 存储消息发送确认状态
  confirmations: new Map(),
  // 最大缓存消息数量
  maxCachedMessages: 100,
  
  // 添加消息到缓存
  addMessage(senderQq, receiverQq, message, messageId, timestamp) {
    const key = this.getCacheKey(senderQq, receiverQq);
    
    if (!this.history[key]) {
      this.history[key] = [];
    }
    
    // 添加新消息
    this.history[key].push({
      sender: senderQq,
      receiver: receiverQq,
      content: message,
      messageId,
      timestamp: timestamp || Date.now(),
      status: 'sent'  // 状态：sent, delivered, read
    });
    
    // 如果超过最大缓存数量，删除最旧的消息
    if (this.history[key].length > this.maxCachedMessages) {
      this.history[key].shift();
    }
    
    return this.history[key][this.history[key].length - 1];
  },
  
  // 获取两个用户之间的消息历史
  getHistory(userQq, otherQq) {
    // 尝试两种组合的键
    const key1 = this.getCacheKey(userQq, otherQq);
    const key2 = this.getCacheKey(otherQq, userQq);
    
    // 合并两个方向的消息并按时间排序
    const messages1 = this.history[key1] || [];
    const messages2 = this.history[key2] || [];
    const combined = [...messages1, ...messages2];
    
    return combined.sort((a, b) => a.timestamp - b.timestamp);
  },
  
  // 添加消息到发送队列
  queueMessage(senderQq, receiverQq, message) {
    const key = this.getCacheKey(senderQq, receiverQq);
    
    if (!this.queue[key]) {
      this.queue[key] = [];
    }
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.queue[key].push({
      sender: senderQq,
      receiver: receiverQq,
      content: message,
      messageId,
      timestamp: Date.now(),
      retries: 0
    });
    
    return messageId;
  },
  
  // 获取下一条要发送的消息
  getNextMessage(senderQq, receiverQq) {
    const key = this.getCacheKey(senderQq, receiverQq);
    if (!this.queue[key] || this.queue[key].length === 0) return null;
    
    return this.queue[key][0];
  },
  
  // 移除已发送的消息
  removeFromQueue(senderQq, receiverQq, messageId) {
    const key = this.getCacheKey(senderQq, receiverQq);
    if (!this.queue[key]) return false;
    
    const index = this.queue[key].findIndex(msg => msg.messageId === messageId);
    if (index !== -1) {
      this.queue[key].splice(index, 1);
      return true;
    }
    
    return false;
  },
  
  // 标记消息为已确认
  markConfirmed(messageId) {
    this.confirmations.set(messageId, true);
  },
  
  // 检查消息是否已确认
  isConfirmed(messageId) {
    return this.confirmations.has(messageId);
  },
  
  // 获取缓存键
  getCacheKey(user1Qq, user2Qq) {
    // 确保键的一致性，无论发送方和接收方的顺序如何
    return user1Qq < user2Qq ? `${user1Qq}_${user2Qq}` : `${user2Qq}_${user1Qq}`;
  },
  
  // 清除特定用户的所有缓存
  clearUserCache(userQq) {
    // 删除与该用户相关的所有历史记录和队列
    for (const key in this.history) {
      if (key.includes(userQq)) {
        delete this.history[key];
      }
    }
    
    for (const key in this.queue) {
      if (key.includes(userQq)) {
        delete this.queue[key];
      }
    }
  }
};

// 优化发送消息函数
function sendMessage(receiverQq, message, chatWindow) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.warn('WebSocket未连接，无法发送消息');
    
    // 将消息加入队列，等待重连后发送
    const messageId = messageCache.queueMessage(currentUserQq, receiverQq, message);
    
    // 通知渲染进程消息将在重连后发送
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('message-send-pending', {
        receiverQq,
        message,
        messageId
      });
    }
    
    return messageId;
  }
  
  try {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    // 构建消息对象
    const messageObj = {
      type: 'message',
      sender: currentUserQq,
      receiver: receiverQq,
      content: message,
      messageId,
      timestamp
    };
    
    // 添加到缓存
    messageCache.addMessage(currentUserQq, receiverQq, message, messageId, timestamp);
    
    // 发送消息
    ws.send(JSON.stringify(messageObj));
    logger.info(`发送消息到 ${receiverQq}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
    
    // 设置确认超时检查
    setTimeout(() => checkMessageConfirmation(messageId), 3000);
    
    return messageId;
  } catch (error) {
    logger.error('发送消息时出错:', error);
    
    // 通知渲染进程消息发送失败
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('message-send-failed', {
        receiverQq,
        message
      });
    }
    
    return null;
  }
}

// 检查消息确认状态
function checkMessageConfirmation(clientMessageId) {
  // 如果消息已确认，则不做任何处理
  if (messageCache.isConfirmed(clientMessageId)) {
    return;
  }
  
  logger.warn(`消息 ${clientMessageId} 未收到确认，可能发送失败`);
  
  // 找到对应的聊天窗口，通知发送失败
  const chatWindows = BrowserWindow.getAllWindows();
  for (const window of chatWindows) {
    if (window.isFocused() && !window.isDestroyed()) {
      window.webContents.send('message-confirmation-timeout', {
        messageId: clientMessageId
      });
    }
  }
}

// 处理消息队列
function processMessageQueue() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const currentUserQq = store.get('currentUserQq');
  if (!currentUserQq) return;
  
  // 遍历所有待发送消息队列
  for (const key in messageCache.queue) {
    if (messageCache.queue[key].length === 0) continue;
    
    const message = messageCache.queue[key][0];
    
    // 只处理当前用户发送的消息
    if (message.sender !== currentUserQq) continue;
    
    try {
      // 更新尝试次数和时间戳
      message.retries += 1;
      message.timestamp = Date.now();
      
      // 构建消息对象
      const messageObj = {
        type: 'message',
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        messageId: message.messageId,
        timestamp: message.timestamp
      };
      
      // 发送消息
      ws.send(JSON.stringify(messageObj));
      logger.info(`从队列发送消息到 ${message.receiver}: ${message.content.substring(0, 30)}${message.content.length > 30 ? '...' : ''}`);
      
      // 移除已发送的消息
      messageCache.removeFromQueue(message.sender, message.receiver, message.messageId);
      
      // 设置确认超时检查
      setTimeout(() => checkMessageConfirmation(message.messageId), 3000);
    } catch (error) {
      logger.error('处理消息队列时出错:', error);
      
      // 如果重试次数超过限制，则移除消息
      if (message.retries >= 3) {
        logger.error(`消息 ${message.messageId} 已达到最大重试次数，放弃发送`);
        messageCache.removeFromQueue(message.sender, message.receiver, message.messageId);
      }
    }
  }
}

// 定期处理消息队列
setInterval(processMessageQueue, 1000);

app.whenReady().then(() => {
  showApp();
  connectWebSocket();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) showApp();
  });
});

ipcMain.on('open-register-window', createRegisterWindow);

ipcMain.on('close-register-window', () => {
  if (registerWindow) {
    registerWindow.close();
  }
});

// 添加处理打开添加好友窗口的事件处理程序
ipcMain.on('open-add-friend-window', createAddFriendWindow);

// 添加关闭添加好友窗口的处理程序
ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  }
});

// 添加最小化窗口的处理程序
ipcMain.on('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.minimize();
  }
});

// 播放声音的事件处理程序
ipcMain.on('play-sound', (event, soundType) => {
  playSound(soundType);
});

ipcMain.on('switch-account', async () => {
  if (mainWindow) {
    const script = `
      const item = localStorage.getItem('rememberedUser');
      if (item) {
        try {
          const user = JSON.parse(item);
          user.autoLogin = false;
          localStorage.setItem('rememberedUser', JSON.stringify(user));
        } catch (e) {
          localStorage.removeItem('rememberedUser');
        }
      }
    `;
    
    await mainWindow.webContents.executeJavaScript(script, true);

    // 重置当前用户QQ号，允许再次登录
    currentUserQq = null;
    
    // 关闭当前窗口并显示新的登录窗口
    mainWindow.close();
    showApp();
  }
});

handle('register', async (event, nickname, password) => {
    const response = await axios.post(`${API_URL}/register`, { nickname, password });
    return response.data;
});

handle('login', async (event, username, password) => {
  // 检查是否已经登录，避免重复登录
  if (currentUserQq) {
    console.log('已经登录，QQ号:', currentUserQq);
    return { success: false, message: `已登录账号 ${currentUserQq}` };
  }

  console.log('尝试登录:', username);
  const response = await axios.post(`${API_URL}/login`, { username, password });
  if (response.data.success) {
    if (!response.data.user || !response.data.user.qq) {
      return { success: false, message: '服务器响应缺少用户信息' };
    }
    
    currentUserQq = response.data.user.qq; // Store current user's QQ
    console.log('登录成功，QQ号:', currentUserQq);
    if (mainWindow) {
      // 预先调整窗口大小，减少重绘次数
      mainWindow.setSize(320, 600, false);
      mainWindow.center();
      // 确保隐藏窗口，避免调整大小过程中的闪烁
      if (mainWindow.isVisible()) {
              mainWindow.hide();
      }
      
      // 更新main窗口，显示主界面
      mainWindow.loadFile('main.html');
      
      // 等待页面加载完成后再执行后续操作
              ipcMain.once('main-page-ready', () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                      const userData = response.data.user;
                      console.log('发送用户信息到渲染进程:', JSON.stringify(userData, null, 2));
          
          // 延迟一点时间再显示窗口，确保DOM已完全渲染
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('user-info', userData);
                      mainWindow.show();
                      
                      // 登录成功后更新好友请求计数
                      updateMainWindowRequestCount();
                  }
          }, 300);
          }
      });
    }
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'login', qq: currentUserQq }));
    }
    return { success: true, user: response.data.user };
  } else {
      return { success: false, message: response.data.message };
  }
});

handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
    });
    
    if (!canceled && filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        console.log('[UI] 用户选择的头像文件路径:', filePath);
        
        try {
            // 读取文件内容并转换为Base64
            const fs = require('fs');
            const fileData = fs.readFileSync(filePath);
            const fileExt = path.extname(filePath).substring(1).toLowerCase();
            const mimeType = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif'
            }[fileExt] || 'image/png';
            
            const base64Data = `data:${mimeType};base64,${fileData.toString('base64')}`;
            console.log('[成功] 文件已转换为Base64, 长度:', base64Data.length);
            
            // 存储路径和Base64数据
            store.set('avatarPath', filePath);
            store.set('avatarBase64', base64Data);
            
            return base64Data;
        } catch (error) {
            console.error('[错误] 读取文件失败:', error.message);
            return null;
        }
    }
    return null;
});

handle('get-avatar-path', async () => {
  const avatar = store.get('avatar');
  return avatar;
});

// 更新用户资料
handle('update-user-profile', async (event, qq, nickname, signature, avatar) => {
  console.log('收到更新用户资料请求:', { qq, nickname, signature, avatar: avatar ? '(图片数据)' : undefined });
  
  if (!qq) {
    console.error('更新资料失败：缺少QQ号码');
    return { success: false, error: '缺少QQ号码' };
  }
  
    // 准备更新的数据
    const userData = {
      nickname,
      signature,
      avatar
    };
    
    // 将头像保存到本地存储
    store.set('avatar', avatar);
    store.set('nickname', nickname);
    store.set('signature', signature);
    
    // 发送到服务器
  console.log(`发送更新请求到: ${API_URL}/update-profile/${qq}`);
  const response = await axios.post(`${API_URL}/update-profile/${qq}`, userData);
    console.log('服务器响应:', response.data);
    
    if (response.data.success) {
      // 如果成功，更新主窗口显示的用户信息
      mainWindow.webContents.send('user-info', response.data.user);
    }
    
    return { success: true, data: response.data };
});

// 更新用户头像
handle('update-avatar', async (event, qq, avatar) => {
  console.log('[网络] 收到更新用户头像请求:', { qq, avatar: avatar ? '(图片数据)' : undefined });
  
  if (!qq) {
    console.error('[错误] 更新头像失败：缺少QQ号码');
    return { success: false, message: '缺少QQ号码' };
  }
  
  if (!avatar) {
    console.error('[错误] 更新头像失败：缺少头像数据');
    return { success: false, message: '缺少头像数据' };
  }
  
  try {
    // 发送到服务器
    console.log(`[网络] 发送头像更新请求到: ${API_URL}/update-avatar/${qq}`);
    const response = await axios.post(`${API_URL}/update-avatar/${qq}`, { avatar });
    console.log('[成功] 头像更新服务器响应:', response.data.success);
    
    if (response.data.success) {
      // 如果成功，更新主窗口显示的用户信息
      mainWindow.webContents.send('user-info', response.data.user);
    }
    
    return { success: response.data.success, message: response.data.message, user: response.data.user };
  } catch (error) {
    console.error('[错误] 更新头像请求失败:', error.message);
    return { success: false, message: '服务器错误，请稍后再试' };
  }
});

// 状态更新处理
handle('update-status', async (event, qq, status) => {
    console.log(`开始处理状态更新请求: QQ=${qq}, 状态=${status}`);
    
    // 最多重试次数
    const MAX_RETRIES = 2;
    let retries = 0;
    
    // 重试函数
    const tryUpdateStatus = async () => {
        try {
            console.log(`尝试更新用户状态 (尝试 ${retries + 1}/${MAX_RETRIES + 1}): QQ=${qq}, 状态=${status}`);
            const response = await axios.post(`${API_URL}/status/update`, { qq, status });
            
            if (response.data.success) {
                console.log(`状态更新成功 (尝试 ${retries + 1})`);
                
                if (status === 'online') {
                    playSound(SOUND_TYPES.ONLINE);
                }

                // 检查响应中是否包含用户信息
                if (response.data.user) {
                    console.log('服务器返回了更新后的用户信息');
                    
                    // 确保状态字段被正确设置
                    const userData = {
                        ...response.data.user,
                        status: status // 确保状态字段正确
                    };
                    
                    // 确保mainWindow存在且未被销毁
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        console.log('发送用户信息到渲染进程:', userData);
                        mainWindow.webContents.send('user-info', userData);
                    } else {
                        console.error('无法发送用户信息：主窗口不存在或已被销毁');
                    }
                    
                    return { success: true, status: status, user: userData };
                } else {
                    console.log('服务器未返回用户信息，尝试获取最新用户信息');
                    // 获取最新的用户信息并发送到渲染进程
                    const userResponse = await axios.get(`${API_URL}/users/${qq}`);
                    if (userResponse.data.success && userResponse.data.user) {
                        // 确保返回的用户对象包含status字段
                        const updatedUser = {
                            ...userResponse.data.user,
                            status: status // 确保状态字段正确设置
                        };
                        
                        console.log('发送更新后的用户信息到渲染进程:', updatedUser);
                        
                        // 确保mainWindow存在且未被销毁
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('user-info', updatedUser);
                        } else {
                            console.error('无法发送用户信息：主窗口不存在或已被销毁');
                        }
                        
                        return { success: true, status: status, user: updatedUser };
                    } else {
                        console.error('获取更新后的用户信息失败');
                        return { success: true, status: status };
                    }
                }
            } else {
                console.error('服务器返回状态更新失败:', response.data);
                return { 
                    success: false, 
                    message: response.data.message || '状态更新失败',
                    retried: retries > 0
                };
            }
        } catch (error) {
            console.error(`状态更新失败 (尝试 ${retries + 1}):`, error);
            
            if (retries < MAX_RETRIES) {
                retries++;
                console.log(`重试状态更新 (${retries}/${MAX_RETRIES})...`);
                return await tryUpdateStatus();
            }
            
            // 明确返回错误信息，而不是抛出错误
            return { 
                success: false, 
                message: error.response?.data?.message || error.message || '状态更新失败',
                retried: retries > 0
            };
        }
    };
    
    return await tryUpdateStatus();
});

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'online': '在线',
        'away': '离开',
        'busy': '忙碌',
        'invisible': '隐身'
    };
    return statusMap[status] || '在线';
}

// 在适当的位置添加或更新好友API实现
// 获取好友列表
handle('get-friends', async (event, qq) => {
    console.log(`[MAIN] 向服务器请求好友列表: QQ=${qq}`);
    try {
        const response = await axios.get(`${API_URL}/friends/${qq}`);
        console.log(`[MAIN] 获取好友列表响应:`, JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error(`[MAIN] 获取好友列表失败:`, error.message);
        return { success: false, message: error.message };
    }
});

// 接受好友请求
handle('accept-friend-request', async (event, userQq, requesterQq) => {
    console.log(`接受好友请求: 用户=${userQq}, 请求方=${requesterQq}`);
  const response = await axios.post(`${API_URL}/friends/accept`, {
      userQq, 
      requesterQq
    });
    console.log('接受好友请求响应:', response.data);
    
    // 如果成功，播放好友添加声音
    if (response.data.success) {
      playSound(SOUND_TYPES.FRIEND_REQUEST);
    }
    
    return response.data;
});

// 拒绝好友请求
handle('reject-friend-request', async (event, userQq, requesterQq) => {
    console.log(`拒绝好友请求: 用户=${userQq}, 请求方=${requesterQq}`);
  const response = await axios.post(`${API_URL}/friends/reject`, {
      userQq, 
      requesterQq
    });
    console.log('拒绝好友请求响应:', response.data);
    return response.data;
});

// 发送好友请求
handle('send-friend-request', async (event, senderQq, recipientQq) => {
    console.log(`发送好友请求: 发送者=${senderQq}, 接收者=${recipientQq}`);
  const response = await axios.post(`${API_URL}/friends/request`, {
      senderQq, 
      recipientQq
    });
    console.log('发送好友请求响应:', response.data);
    return response.data;
});

// 搜索用户
handle('search-users', async (event, term, currentUserQq) => {
    console.log(`搜索用户: 关键词=${term}, 当前用户=${currentUserQq}`);
  const response = await axios.post(`${API_URL}/users/search`, {
      term, 
      currentUserQq
    });
    console.log('搜索用户响应:', response.data);
    return response.data;
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

app.on('window-all-closed', function () {
  // 清理托盘图标
  if (tray) {
    tray.destroy();
    tray = null;
  }
  
  // 清理闪烁定时器
  if (flashingInterval) {
    clearInterval(flashingInterval);
    flashingInterval = null;
  }
  
  // 无论什么平台都退出应用
  app.quit();
}); 

// 重新生成所有用户头像
ipcMain.handle('regenerate-all-avatars', async () => {
  try {
    const response = await axios.post(`${API_URL}/regenerate-avatars`);
    if (response.data.success) {
      console.log('[成功] 所有用户头像已重新生成');
      
      // 如果用户已登录，重新获取用户信息和好友列表
      if (currentUserQq && mainWindow && !mainWindow.isDestroyed()) {
        try {
          // 获取当前用户信息
          const userResponse = await axios.get(`${API_URL}/users/${currentUserQq}`);
          if (userResponse.data.success) {
            mainWindow.webContents.send('user-info', userResponse.data.user);
          }
          
          // 获取好友列表
          const friendsResponse = await axios.get(`${API_URL}/friends/${currentUserQq}`);
          if (friendsResponse.data.success) {
            // 通知渲染进程更新好友列表
            mainWindow.webContents.send('friends-updated', friendsResponse.data);
          }
        } catch (error) {
          console.error('[错误] 刷新用户信息失败:', error.message);
        }
      }
      
      return { success: true, message: '所有用户头像已重新生成' };
    } else {
      console.error('[错误] 重新生成头像失败:', response.data.message);
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    console.error('[错误] 重新生成头像请求失败:', error.message);
    return { success: false, message: '服务器错误，请稍后再试' };
  }
}); 

// 切换窗口置顶状态
ipcMain.on('toggle-always-on-top', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const isAlwaysOnTop = win.isAlwaysOnTop();
    win.setAlwaysOnTop(!isAlwaysOnTop);
    event.reply('always-on-top-changed', !isAlwaysOnTop);
    console.log(`[UI] 窗口置顶状态已切换为: ${!isAlwaysOnTop ? '开启' : '关闭'}`);
  }
});

// 获取窗口置顶状态
ipcMain.handle('get-always-on-top-state', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    return win.isAlwaysOnTop();
  }
  return false;
}); 

// 存储聊天窗口的映射
let chatWindows = {};

// 创建聊天窗口
function createChatWindow(friendQq, friendInfo) {
  // 如果已经存在该好友的聊天窗口，则聚焦
  if (chatWindows[friendQq]) {
    chatWindows[friendQq].focus();
    clearUnreadMessages(friendQq);
    return;
  }

  const winOptions = {
    width: 360,
    height: 480,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  // 创建一个新的窗口
  const chatWindow = new BrowserWindow(winOptions);
  
  // 加载HTML文件
  chatWindow.loadFile('chat.html');

  // 存储窗口引用
  chatWindows[friendQq] = chatWindow;

  // 窗口加载完成后发送好友信息
  chatWindow.webContents.on('did-finish-load', async () => {
    chatWindow.webContents.send('chat-friend-info', {
      currentUserQq,
      friendInfo
    });
    
    // 清除未读消息
    clearUnreadMessages(friendQq);
    
    try {
      // 标记消息为已读
      await axios.post(`${API_URL}/messages/read`, {
        userQq: currentUserQq,
        otherQq: friendQq
      });
    } catch (error) {
      console.error('[错误] 标记消息为已读失败:', error);
    }
  });
  
  // 窗口聚焦时清除未读消息
  chatWindow.on('focus', async () => {
    clearUnreadMessages(friendQq);
    
    try {
      // 标记消息为已读
      await axios.post(`${API_URL}/messages/read`, {
        userQq: currentUserQq,
        otherQq: friendQq
      });
    } catch (error) {
      console.error('[错误] 标记消息为已读失败:', error);
    }
  });

  // 窗口关闭时清理引用
  chatWindow.on('closed', () => {
    delete chatWindows[friendQq];
  });

  return chatWindow;
}

// 处理打开聊天窗口的请求
ipcMain.on('open-chat-window', async (event, friendQq) => {
  try {
    console.log(`[UI] 请求打开与好友 ${friendQq} 的聊天窗口`);
    
    // 获取好友信息
    const response = await axios.get(`${API_URL}/users/${friendQq}`);
    if (response.data.success) {
      const friendInfo = response.data.user;
      createChatWindow(friendQq, friendInfo);
      
      // 清除未读消息
      clearUnreadMessages(friendQq);
    } else {
      console.error('[错误] 获取好友信息失败:', response.data.message);
    }
  } catch (error) {
    console.error('[错误] 打开聊天窗口失败:', error.message);
  }
});

// 处理发送消息的请求
ipcMain.on('send-message', async (event, { receiverQq, message }) => {
  try {
    console.log(`[网络] 发送消息给好友 ${receiverQq}: ${message.substring(0, 20)}${message.length > 20 ? '...' : ''}`);
    
    if (!currentUserQq) {
      throw new Error('用户未登录');
    }
    
    // 获取发送窗口
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // 通过WebSocket发送消息
    const sent = sendMessage(receiverQq, message, win);
    
    // 通知发送状态
    event.reply('message-sent', { 
      success: sent, 
      receiverQq, 
      message,
      timestamp: Date.now()
    });
    
    // 如果WebSocket发送失败，尝试通过HTTP API发送
    if (!sent) {
      try {
        const response = await axios.post(`${API_URL}/messages/send`, {
          senderQq: currentUserQq,
          receiverQq,
          message
        });
        
        if (response.data.success) {
          console.log(`[成功] 消息已通过HTTP API发送至服务器`);
          
          // 更新发送状态
          event.reply('message-sent', { 
            success: true, 
            receiverQq, 
            message,
            messageId: response.data.messageId
          });
          
          // 如果聊天窗口存在，立即发送消息确认
          if (chatWindows[receiverQq]) {
            chatWindows[receiverQq].webContents.send('message-sent-confirmed', {
              messageId: response.data.messageId,
              receiverQq,
              content: message,
              timestamp: Date.now()
            });
          }
        }
      } catch (apiError) {
        console.error('[错误] HTTP API发送消息失败:', apiError.message);
      }
    }
  } catch (error) {
    console.error('[错误] 发送消息失败:', error.message);
    event.reply('message-sent', { success: false, error: error.message });
  }
});

// 获取聊天历史
ipcMain.handle('get-chat-history', async (event, otherQq) => {
  try {
    if (!currentUserQq) {
      throw new Error('用户未登录');
    }
    
    console.log(`[网络] 获取与 ${otherQq} 的聊天历史`);
    const response = await axios.get(`${API_URL}/messages/${currentUserQq}/${otherQq}`);
    
    if (response.data.success) {
      console.log(`[成功] 获取到 ${response.data.messages.length} 条聊天记录`);
      return response.data.messages;
    } else {
      throw new Error(response.data.message || '获取聊天历史失败');
    }
  } catch (error) {
    console.error('[错误] 获取聊天历史失败:', error.message);
    return [];
  }
});

// 标记消息为已读
ipcMain.handle('mark-messages-read', async (event, otherQq) => {
  try {
    if (!currentUserQq) {
      throw new Error('用户未登录');
    }
    
    console.log(`[网络] 标记来自 ${otherQq} 的消息为已读`);
    const response = await axios.post(`${API_URL}/messages/read`, {
      userQq: currentUserQq,
      otherQq
    });
    
    return response.data.success;
  } catch (error) {
    console.error('[错误] 标记消息为已读失败:', error.message);
    return false;
  }
}); 

// 错误处理和恢复机制
const errorHandler = {
  // 错误历史，用于跟踪错误频率和模式
  errorHistory: [],
  // 最大错误历史记录数
  maxErrorHistory: 20,
  // 服务状态
  serviceStatus: {
    server: true,    // 服务器连接状态
    db: true,        // 数据库状态
    network: true    // 网络连接状态
  },
  // 崩溃恢复状态
  recoveryMode: false,
  
  // 处理未捕获的异常
  handleUncaughtException(error) {
    this.logError('uncaught', error);
    
    // 防止应用崩溃，但记录错误
    logger.error('未捕获的异常:', error);
    
    // 检查错误类型并尝试恢复
    this.attemptRecovery(error);
  },
  
  // 处理未处理的Promise rejection
  handleUnhandledRejection(reason, promise) {
    this.logError('promise', reason);
    
    // 记录未处理的Promise拒绝
    logger.error('未处理的Promise拒绝:', reason);
    
    // 检查错误类型并尝试恢复
    this.attemptRecovery(reason);
  },
  
  // 处理渲染进程错误
  handleRendererProcessCrash(event, webContents, killed) {
    const windowTitle = webContents.getTitle();
    logger.error(`渲染进程崩溃: ${windowTitle}, 是否被强制终止: ${killed}`);
    
    // 如果是聊天窗口，尝试重新创建
    if (windowTitle.includes('聊天')) {
      // 从标题中提取好友QQ号
      const match = windowTitle.match(/与\s(.+)\s聊天/);
      if (match && match[1]) {
        const friendNickname = match[1];
        // 查找对应的好友信息
        findFriendByNickname(friendNickname).then(friend => {
          if (friend) {
            // 延迟一点再重新创建窗口
            setTimeout(() => {
              createChatWindow(friend.qq, friend);
              notifyUser(`聊天窗口已恢复`, '窗口崩溃恢复');
            }, 1000);
          }
        });
      }
    }
  },
  
  // 处理IPC错误
  handleIpcError(event, channelName, error) {
    this.logError('ipc', { channelName, error });
    logger.error(`IPC错误: 通道 ${channelName}, 错误:`, error);
  },
  
  // 记录错误
  logError(type, error) {
    // 创建错误记录
    const errorRecord = {
      type,
      message: error.message || String(error),
      stack: error.stack,
      timestamp: Date.now()
    };
    
    // 添加到历史记录
    this.errorHistory.push(errorRecord);
    
    // 限制历史记录大小
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }
    
    // 分析错误频率，如果短时间内出现多次相同错误，可能需要更严格的恢复措施
    this.analyzeErrorFrequency(errorRecord);
  },
  
  // 分析错误频率
  analyzeErrorFrequency(newError) {
    const lastMinute = Date.now() - 60000; // 1分钟内
    
    // 计算最近1分钟内相似错误的数量
    const similarErrors = this.errorHistory.filter(err => 
      err.timestamp > lastMinute && 
      err.message === newError.message
    );
    
    // 如果短时间内出现多次相同错误，进入恢复模式
    if (similarErrors.length >= 3) {
      logger.warn(`检测到短时间内多次相同错误，开始恢复过程: ${newError.message}`);
      this.enterRecoveryMode();
    }
  },
  
  // 尝试恢复
  attemptRecovery(error) {
    // 已经处于恢复模式，跳过
    if (this.recoveryMode) return;
    
    // 根据错误类型采取不同的恢复策略
    if (error instanceof Error) {
      // 网络连接错误
      if (
        error.message.includes('ECONNREFUSED') || 
        error.message.includes('ECONNRESET') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('getaddrinfo')
      ) {
        this.serviceStatus.network = false;
        this.serviceStatus.server = false;
        logger.warn('检测到网络连接问题，尝试重新连接WebSocket');
        handleReconnect();
      } 
      // WebSocket错误
      else if (error.message.includes('WebSocket') || error.message.includes('socket')) {
        logger.warn('检测到WebSocket错误，重置连接');
        handleReconnect();
      }
      // 数据存储错误
      else if (error.message.includes('JSON') || error.message.includes('parse')) {
        this.serviceStatus.db = false;
        logger.warn('检测到数据格式错误，尝试修复本地存储');
        this.repairLocalStorage();
      }
    }
  },
  
  // 进入恢复模式
  enterRecoveryMode() {
    if (this.recoveryMode) return;
    
    this.recoveryMode = true;
    logger.warn('进入应用恢复模式');
    
    // 通知所有窗口进入恢复模式
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('enter-recovery-mode');
      }
    });
    
    // 执行恢复步骤
    this.performRecoverySteps().then(() => {
      logger.info('恢复步骤完成，退出恢复模式');
      this.exitRecoveryMode();
    }).catch(err => {
      logger.error('执行恢复步骤时出错:', err);
      // 即使出错也退出恢复模式，避免卡在恢复状态
      this.exitRecoveryMode();
    });
  },
  
  // 退出恢复模式
  exitRecoveryMode() {
    this.recoveryMode = false;
    
    // 通知所有窗口退出恢复模式
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('exit-recovery-mode');
      }
    });
  },
  
  // 执行恢复步骤
  async performRecoverySteps() {
    // 1. 重置WebSocket连接
    if (ws) {
      try {
        ws.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
    
    // 2. 检查并修复本地存储
    await this.repairLocalStorage();
    
    // 3. 重新连接WebSocket
    connectWebSocket();
    
    // 4. 回退到登录页面（如果需要）
    if (!this.serviceStatus.server || !this.serviceStatus.db) {
      logger.warn('服务状态异常，即将回退到登录页面');
      
      // 保存当前用户信息，以便恢复后重新登录
      const currentUserQq = store.get('currentUserQq');
      
      // 关闭所有窗口，回到登录页面
      setTimeout(() => {
        BrowserWindow.getAllWindows().forEach(win => {
          if (win !== mainWindow && !win.isDestroyed()) {
            win.close();
          }
        });
        
        // 回到登录页面
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadFile('login.html');
          mainWindow.show();
          mainWindow.focus();
          
          // 发送错误通知
          setTimeout(() => {
            mainWindow.webContents.send('login-recovery-error', {
              message: '检测到应用异常，已重置连接。请重新登录。',
              savedQq: currentUserQq
            });
          }, 1000);
        }
      }, 500);
    }
  },
  
  // 修复本地存储
  async repairLocalStorage() {
    logger.info('尝试修复本地存储');
    
    try {
      // 清理可能损坏的缓存
      if (store.has('chatCache')) {
        store.delete('chatCache');
      }
      
      // 重新加载用户信息
      if (store.has('currentUserQq')) {
        const userQq = store.get('currentUserQq');
        try {
          // 重新从服务器加载用户信息
          const response = await axios.get(`${API_URL}/users/${userQq}`);
          if (response.data && response.data.success && response.data.user) {
            logger.info('成功从服务器恢复用户数据');
            store.set('currentUser', response.data.user);
            this.serviceStatus.db = true;
          }
        } catch (err) {
          logger.error('从服务器恢复用户数据失败:', err);
        }
      }
    } catch (error) {
      logger.error('修复本地存储时出错:', error);
      // 如果修复失败，可能需要更极端的措施
      try {
        store.clear();
        logger.warn('已清空本地存储');
      } catch (e) {
        logger.error('清空本地存储失败:', e);
      }
    }
  }
};

// 查找好友通过昵称（用于窗口恢复）
async function findFriendByNickname(nickname) {
  try {
    const currentUserQq = store.get('currentUserQq');
    if (!currentUserQq) return null;
    
    const response = await axios.get(`${API_URL}/friends/${currentUserQq}`);
    if (response.data && response.data.success && response.data.friends) {
      return response.data.friends.find(friend => friend.nickname === nickname);
    }
    return null;
  } catch (error) {
    logger.error('通过昵称查找好友时出错:', error);
    return null;
  }
}

// 显示通知给用户
function notifyUser(message, title = '通知') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  // 创建原生通知
  const notification = new Notification({
    title,
    body: message,
    icon: path.join(__dirname, 'assets', 'logo.png')
  });
  
  notification.show();
  
  // 同时发送到窗口
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('notification', { title, message });
    }
  });
}

// 注册错误处理器
process.on('uncaughtException', (error) => {
  errorHandler.handleUncaughtException(error);
});

process.on('unhandledRejection', (reason, promise) => {
  errorHandler.handleUnhandledRejection(reason, promise);
});

app.on('render-process-crashed', (event, webContents, killed) => {
  errorHandler.handleRendererProcessCrash(event, webContents, killed);
});

ipcMain.on('renderer-error', (event, error) => {
  errorHandler.logError('renderer', error);
  logger.error('渲染进程报告错误:', error);
}); 

// 内存管理和优化
const memoryManager = {
  // 窗口状态
  windows: {
    chat: new Map(),  // 聊天窗口映射: friendQq -> BrowserWindow
    auxiliary: new Set() // 辅助窗口集合
  },
  
  // 窗口使用情况
  windowUsage: new Map(), // 窗口 -> { lastActive: timestamp }
  
  // 内存使用阈值（MB）
  memoryThresholds: {
    warning: 200,
    critical: 300
  },
  
  // 上次内存检查时间
  lastMemoryCheck: 0,
  
  // 内存检查间隔（ms）
  memoryCheckInterval: 60000, // 每分钟
  
  // 初始化内存管理
  initialize() {
    // 定期检查内存使用情况
    setInterval(() => this.checkMemoryUsage(), this.memoryCheckInterval);
    
    // 监听窗口焦点事件
    app.on('browser-window-focus', (_, window) => {
      this.updateWindowActivity(window);
    });
    
    // 监听窗口创建事件
    app.on('browser-window-created', (_, window) => {
      this.registerWindow(window);
    });
  },
  
  // 注册窗口
  registerWindow(window) {
    // 设置初始使用情况
    this.updateWindowActivity(window);
    
    // 监听窗口关闭
    window.on('closed', () => {
      this.windowUsage.delete(window);
    });
  },
  
  // 更新窗口活动状态
  updateWindowActivity(window) {
    if (!window || window.isDestroyed()) return;
    
    this.windowUsage.set(window, {
      lastActive: Date.now()
    });
  },
  
  // 注册聊天窗口
  registerChatWindow(friendQq, window) {
    this.windows.chat.set(friendQq, window);
    
    // 监听窗口关闭
    window.on('closed', () => {
      this.windows.chat.delete(friendQq);
    });
  },
  
  // 获取聊天窗口
  getChatWindow(friendQq) {
    return this.windows.chat.get(friendQq);
  },
  
  // 检查聊天窗口是否存在
  hasChatWindow(friendQq) {
    const win = this.windows.chat.get(friendQq);
    return win && !win.isDestroyed();
  },
  
  // 注册辅助窗口
  registerAuxiliaryWindow(window) {
    this.windows.auxiliary.add(window);
    
    // 监听窗口关闭
    window.on('closed', () => {
      this.windows.auxiliary.delete(window);
    });
  },
  
  // 检查内存使用情况
  async checkMemoryUsage() {
    try {
      // 获取进程内存使用
      const memoryInfo = process.getProcessMemoryInfo();
      const usedMemoryMB = Math.round(memoryInfo.private / (1024 * 1024));
      
      logger.info(`当前内存使用: ${usedMemoryMB} MB`);
      
      // 如果超过警告阈值，进行优化
      if (usedMemoryMB > this.memoryThresholds.warning) {
        logger.warn(`内存使用超过警告阈值: ${usedMemoryMB} MB`);
        this.optimizeMemoryUsage(usedMemoryMB);
      }
      
      // 如果超过临界阈值，进行更激进的优化
      if (usedMemoryMB > this.memoryThresholds.critical) {
        logger.error(`内存使用超过临界阈值: ${usedMemoryMB} MB`);
        this.forceFreeMemory();
      }
      
      this.lastMemoryCheck = Date.now();
    } catch (error) {
      logger.error('检查内存使用时出错:', error);
    }
  },
  
  // 优化内存使用
  optimizeMemoryUsage(currentUsageMB) {
    // 1. 释放长时间未使用的聊天窗口
    this.releaseInactiveWindows();
    
    // 2. 请求垃圾收集
    if (global.gc) {
      logger.info('手动触发垃圾收集');
      global.gc();
    }
    
    // 3. 请求渲染进程释放内存
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('optimize-memory');
      }
    });
  },
  
  // 释放不活跃的窗口
  releaseInactiveWindows() {
    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10分钟
    
    // 检查所有窗口的最后活动时间
    this.windowUsage.forEach((usage, window) => {
      // 跳过主窗口
      if (window === mainWindow) return;
      
      // 如果窗口长时间未活动
      if (now - usage.lastActive > inactiveThreshold) {
        // 如果是聊天窗口，最小化而不是关闭
        if ([...this.windows.chat.values()].includes(window)) {
          if (!window.isMinimized() && !window.isDestroyed()) {
            logger.info('最小化不活跃的聊天窗口');
            window.minimize();
          }
        }
        // 如果是辅助窗口，可以考虑关闭
        else if (this.windows.auxiliary.has(window) && !window.isDestroyed()) {
          logger.info('关闭不活跃的辅助窗口');
          window.close();
        }
      }
    });
  },
  
  // 强制释放内存
  forceFreeMemory() {
    logger.warn('执行强制内存释放');
    
    // 1. 关闭所有辅助窗口
    this.windows.auxiliary.forEach(win => {
      if (!win.isDestroyed()) {
        win.close();
      }
    });
    
    // 2. 最小化所有聊天窗口
    this.windows.chat.forEach(win => {
      if (!win.isDestroyed() && !win.isMinimized()) {
        win.minimize();
      }
    });
    
    // 3. 清理缓存
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.session.clearCache();
      mainWindow.webContents.session.clearStorageData({
        storages: ['appcache', 'cookies', 'filesystem', 'shadercache', 'serviceworkers']
      });
    }
    
    // 4. 强制垃圾回收
    if (global.gc) {
      logger.info('强制垃圾收集');
      global.gc();
    }
  }
};

// 重写聊天窗口创建函数，使用内存管理器
function createChatWindow(friendQq, friendInfo) {
  // 检查聊天窗口是否已经存在
  let chatWindow = memoryManager.getChatWindow(friendQq);
  
  // 如果窗口存在且未销毁，直接显示并激活
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    
    // 更新窗口活动状态
    memoryManager.updateWindowActivity(chatWindow);
    
    // 标记消息为已读
    ipcMain.invoke('mark-messages-read', friendQq);
    
    return chatWindow;
  }
  
  // 创建新窗口
  chatWindow = new BrowserWindow({
    width: 550,
    height: 500,
    minWidth: 450,
    minHeight: 400,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      spellcheck: true,
      // 启用内存节省特性
      backgroundThrottling: true,
      offscreen: false // 除非绝对必要，否则不要启用这个
    },
    show: false // 加载完成后再显示
  });
  
  // 加载聊天窗口HTML
  chatWindow.loadFile('chat.html');
  
  // 注册窗口
  memoryManager.registerChatWindow(friendQq, chatWindow);
  
  // 窗口准备好后再显示
  chatWindow.once('ready-to-show', () => {
    chatWindow.show();
    
    // 发送好友信息到窗口
    chatWindow.webContents.send('chat-friend-info', {
      friendInfo,
      currentUserQq
    });
    
    // 标记消息为已读
    ipcMain.invoke('mark-messages-read', friendQq);
  });
  
  // 设置窗口置顶状态
  // 获取主窗口的置顶状态
  const mainWindowAlwaysOnTop = mainWindow ? mainWindow.isAlwaysOnTop() : false;
  chatWindow.setAlwaysOnTop(mainWindowAlwaysOnTop);
  
  // 窗口关闭时清理
  chatWindow.on('closed', () => {
    clearUnreadMessages(friendQq);
  });
  
  return chatWindow;
}

// 优化主窗口创建
function createMainWindow() {
  const winOptions = {
    width: 440,
    height: 600,
    minWidth: 360,
    minHeight: 500,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      // 启用内存节省特性
      backgroundThrottling: true,
      // 延迟加载，减少初始内存占用
      webviewTag: false,
      devTools: process.env.NODE_ENV !== 'production'
    }
  };
  
  const window = createWindow(winOptions, 'main.html');
  
  // 窗口准备好后再显示
  window.once('ready-to-show', () => {
    window.show();
  });
  
  // 注册主窗口
  memoryManager.registerWindow(window);
  
  return window;
}

// 在应用准备好后初始化内存管理
app.whenReady().then(() => {
  memoryManager.initialize();
  
  // 如果支持，启用垃圾回收
  if (typeof global.gc === 'function') {
    logger.info('垃圾回收器可用');
  } else {
    logger.warn('垃圾回收器不可用，需要使用 --expose-gc 参数启动应用以启用');
  }
}); 