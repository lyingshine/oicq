
try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const Store = require('electron-store'); // Still used for avatar path
const axios = require('axios');
const WebSocket = require('ws');

// 设置缓存目录
app.setPath('userData', path.join(__dirname, 'userData'));
app.setPath('cache', path.join(__dirname, 'cache'));

// 添加控制台日志过滤功能
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  // 禁用所有控制台输出
  return;
};

console.error = function(...args) {
  // 禁用所有控制台输出
  return;
};

function wrapMethod(obj, method, wrapper) {
  const original = obj[method].bind(obj);
  obj[method] = wrapper(original);
}

// 解决在 Windows 终端中输出中文乱码的问题
if (process.platform === 'win32') {
  const iconv = require('iconv-lite');
  const streams = [process.stdout, process.stderr];

  streams.forEach(stream => {
      wrapMethod(stream, 'write', (originalWrite) => (chunk, encoding, callback) => {
          if (typeof chunk === 'string') {
              chunk = iconv.encode(chunk, 'gbk');
              encoding = 'buffer';
          } else if (Buffer.isBuffer(chunk) && encoding !== 'buffer') {
              // 如果是Buffer但不是我们转换的，我们假设它是UTF8
              chunk = iconv.encode(chunk.toString(), 'gbk');
              encoding = 'buffer';
          }
          return originalWrite.call(stream, chunk, encoding, callback);
      });
  });
}

const store = new Store();
const API_URL = 'http://localhost:3000/api';

// 声音类型
const SOUND_TYPES = {
  ONLINE: '上线提示音',
  MESSAGE: '信息提示音',
  FRIEND_REQUEST: '加好友提示'
};

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
let ws;
let messageQueue = [];
let pendingMessages = new Map(); // 等待确认的消息
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 1000; // 初始重连延迟为1秒

// 连接WebSocket
function connectWebSocket() {
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      // 忽略关闭错误
    }
  }

  try {
    console.log('[网络] 正在连接WebSocket服务器...');
    ws = new WebSocket('ws://localhost:3000');
    
    // 设置超时检测
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        console.error('[网络] WebSocket连接超时');
        ws.close();
        handleReconnect();
      }
    }, 5000);

    ws.onopen = () => {
      console.log('[网络] WebSocket连接已建立');
      clearTimeout(connectionTimeout);
      reconnectAttempts = 0; // 重置重连计数
      
      // 发送登录信息
      if (currentUserQq) {
        try {
          ws.send(JSON.stringify({ type: 'login', qq: currentUserQq }));
        } catch (e) {
          console.error('[网络] 发送登录信息失败:', e);
        }
      }
      
      // 发送所有排队的消息
      processMessageQueue();
    };
    
    ws.onmessage = handleWebSocketMessage;

    ws.onerror = (error) => {
      console.error('[网络错误] WebSocket连接错误:', error);
    };

    ws.onclose = (event) => {
      console.log(`[网络] WebSocket连接已关闭，代码: ${event.code}`);
      handleReconnect();
    };
  } catch (e) {
    console.error('[网络] 创建WebSocket连接失败:', e);
    handleReconnect();
  }
}

// 处理重连
function handleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[网络] 达到最大重连次数，停止重连');
    return;
  }
  
  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts - 1); // 指数退避
  console.log(`[恢复] 尝试重新连接WebSocket (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})，延迟: ${delay}ms`);
  
  setTimeout(connectWebSocket, delay);
}

// 处理WebSocket消息
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
      
      // 确认消息接收
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
        // 立即发送消息到渲染进程
        try {
          chatWindows[sender].webContents.send('message-received', {
            message: content,
            senderQq: sender,
            timestamp,
            messageId: id
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
          
          // 尝试重新发送
          setTimeout(() => {
            if (chatWindows[sender] && !chatWindows[sender].isDestroyed()) {
              chatWindows[sender].webContents.send('message-received', {
                message: content,
                senderQq: sender,
                timestamp,
                messageId: id
              });
            }
          }, 500);
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

// 发送消息
function sendMessage(receiverQq, message, chatWindow) {
  if (!currentUserQq || !ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[错误] 无法发送消息: 未连接到服务器');
    return false;
  }
  
  const clientMessageId = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  try {
    // 将消息添加到待确认列表
    pendingMessages.set(clientMessageId, {
      receiverQq,
      message,
      timestamp: Date.now(),
      chatWindow,
      attempts: 0,
      received: false
    });
    
    // 发送消息
    ws.send(JSON.stringify({
      type: 'send-message',
      sender: currentUserQq,
      receiver: receiverQq,
      content: message,
      clientMessageId
    }));
    
    // 设置消息确认超时
    setTimeout(() => {
      checkMessageConfirmation(clientMessageId);
    }, 3000);
    
    return true;
  } catch (error) {
    console.error('[错误] 发送消息失败:', error);
    
    // 加入队列，稍后重试
    messageQueue.push({
      type: 'send-message',
      receiverQq,
      message,
      clientMessageId,
      chatWindow
    });
    
    return false;
  }
}

// 检查消息确认状态
function checkMessageConfirmation(clientMessageId) {
  if (!pendingMessages.has(clientMessageId)) {
    return; // 消息已确认或已取消
  }
  
  const pendingMsg = pendingMessages.get(clientMessageId);
  
  // 如果消息未被服务器接收
  if (!pendingMsg.received) {
    pendingMsg.attempts++;
    
    if (pendingMsg.attempts > 3) {
      // 重试次数过多，通知用户消息可能未发送成功
      console.error(`[错误] 消息发送失败，重试次数过多: ${clientMessageId}`);
      
      if (pendingMsg.chatWindow && !pendingMsg.chatWindow.isDestroyed()) {
        pendingMsg.chatWindow.webContents.send('message-send-failed', {
          clientMessageId,
          message: pendingMsg.message
        });
      }
      
      pendingMessages.delete(clientMessageId);
    } else {
      // 重新发送消息
      console.log(`[网络] 重新发送消息 (${pendingMsg.attempts}/3): ${clientMessageId}`);
      
      try {
        ws.send(JSON.stringify({
          type: 'send-message',
          sender: currentUserQq,
          receiver: pendingMsg.receiverQq,
          content: pendingMsg.message,
          clientMessageId
        }));
        
        // 再次检查确认状态
        setTimeout(() => {
          checkMessageConfirmation(clientMessageId);
        }, 3000);
      } catch (error) {
        console.error('[错误] 重新发送消息失败:', error);
        
        // 连接可能已断开，加入队列
        messageQueue.push({
          type: 'send-message',
          receiverQq: pendingMsg.receiverQq,
          message: pendingMsg.message,
          clientMessageId,
          chatWindow: pendingMsg.chatWindow
        });
        
        pendingMessages.delete(clientMessageId);
      }
    }
  }
}

// 处理消息队列
function processMessageQueue() {
  if (!ws || ws.readyState !== WebSocket.OPEN || messageQueue.length === 0) {
    return;
  }
  
  console.log(`[网络] 处理消息队列，共 ${messageQueue.length} 条消息`);
  
  // 复制队列并清空原队列
  const queue = [...messageQueue];
  messageQueue = [];
  
  // 处理每条消息
  queue.forEach(item => {
    if (item.type === 'send-message') {
      sendMessage(item.receiverQq, item.message, item.chatWindow);
    }
  });
}

// 定期检查并处理消息队列
setInterval(processMessageQueue, 5000);

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