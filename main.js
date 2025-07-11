
try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store'); // Still used for avatar path
const axios = require('axios');

// 添加控制台日志过滤功能
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  // 只允许输出包含状态切换相关关键词的日志
  const logString = args.join(' ').toLowerCase();
  if (
    logString.includes('状态更新') || 
    logString.includes('状态=') || 
    logString.includes('status=') || 
    logString.includes('status：') ||
    logString.includes('状态：')
  ) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = function(...args) {
  // 保留所有状态更新相关的错误
  const logString = args.join(' ').toLowerCase();
  if (
    logString.includes('状态更新') || 
    logString.includes('状态=') || 
    logString.includes('status')
  ) {
    originalConsoleError.apply(console, args);
  }
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
  mainWindow.webContents.executeJavaScript(`
    (function(){
      const audio = new Audio('${soundPath.replace(/\\/g, '\\\\')}');
      audio.play().catch(err => console.error('播放声音失败:', err));
    })();
  `, true);
}

let mainWindow;
let registerWindow;
let addFriendWindow;
let currentUserQq = null;
let friends = []; // 用于存储好友列表
let friendRequests = []; // 用于存储好友请求
let friendGroups = []; // 用于存储好友分组

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

// 检查和获取好友请求数量的辅助函数
async function getFriendRequestCount() {
    if (!currentUserQq) return 0;

    try {
        const response = await axios.get(`${API_URL}/friends/${currentUserQq}`);
        if (response.data.success && response.data.requests) {
            return response.data.requests.length;
        }
    } catch (error) {
        console.error('获取好友请求数量失败:', error);
    }
    return 0;
}

// 更新主窗口的好友请求计数
async function updateMainWindowRequestCount() {
    if (!currentUserQq || !mainWindow) {
        console.log('更新好友请求计数失败: 当前用户或主窗口不存在');
        return;
    }

    try {
        console.log('获取好友请求计数...');
        const count = await getFriendRequestCount();
        console.log(`当前好友请求数量: ${count}`);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('发送好友请求计数到渲染进程');
            mainWindow.webContents.send('friend-request-count', count);
            
            // 如果有好友请求，播放提示音
            if (count > 0) {
                // 仅当接收到新好友请求时才发送事件和播放声音
                console.log('发送好友请求通知事件');
                mainWindow.webContents.send('friend-request');
                playSound(SOUND_TYPES.FRIEND_REQUEST);
            }
        }
    } catch (error) {
        console.error('更新好友请求计数失败:', error);
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
      return await callback(event, ...args);
    } catch (error) {
      console.error(`IPC Error on ${channel}:`, error);
      if (error.response) {
        return { success: false, message: error.response.data.message || '服务器响应错误。' };
      } else if (error.request) {
        return { success: false, message: '无法连接到服务器。' };
            } else {
        return { success: false, message: error.message };
                }
            }
        });
};

app.whenReady().then(() => {
  showApp();

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

ipcMain.on('switch-account', () => {
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
    mainWindow.webContents.executeJavaScript(script, true)
      .then(() => {
        // 重置当前用户QQ号，允许再次登录
        currentUserQq = null;
        mainWindow.close();
        mainWindow = createWindow();
      });
  }
});

handle('register', async (event, nickname, password) => {
    const response = await axios.post(`${API_URL}/register`, { nickname, password });
    return response.data;
});

ipcMain.on('login', async (event, username, password) => {
  // 检查是否已经登录，避免重复登录
  if (currentUserQq) {
    console.log('已经登录，QQ号:', currentUserQq);
    return;
  }

  try {
    console.log('尝试登录:', username);
    const response = await axios.post(`${API_URL}/login`, { username, password });
    if (response.data.success) {
      if (!response.data.user || !response.data.user.qq) {
        event.sender.send('login-failed', '服务器响应缺少用户信息');
        return;
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
        
        // 加载主界面
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
    } else {
        event.sender.send('login-failed', response.data.message);
    }
  } catch (error) {
    let message = '登录时发生未知错误。';
    if (error.response) {
      message = error.response.data.message || '服务器响应错误。';
    } else if (error.request) {
      message = '无法连接到服务器。';
    } else {
      message = error.message;
    }
    event.sender.send('login-failed', message);
  }
});

handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
    });
    if (!canceled) {
        store.set('avatarPath', filePaths[0]);
        return filePaths[0];
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

// 状态更新处理
handle('update-status', async (event, qq, status) => {
    try {
        console.log(`更新用户状态: QQ=${qq}, 状态=${status}`);
        const response = await axios.post(`${API_URL}/status/update`, { qq, status });
        
        if (response.data.success) {
            console.log('状态更新成功');
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
        } else {
            throw new Error(response.data.message || '状态更新失败');
        }
    } catch (error) {
        console.error('状态更新失败:', error);
        throw error;
    }
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
    console.log(`向服务器请求好友列表: QQ=${qq}`);
  const response = await axios.get(`${API_URL}/friends/${qq}`);
    console.log(`获取好友列表响应:`, response.data);
    return response.data;
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
      playSound('加好友提示');
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

// This is now deprecated and handled by the new request system.
handle('add-friend', async (event, userQq, friendQq) => {
    // This function is kept to avoid breaking the old flow, but it does nothing.
    console.log('Deprecated: add-friend IPC used. Switched to request system.');
    return { success: false, message: 'This feature has been updated. Please use the new add friend window.' };
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
  if (process.platform !== 'darwin') app.quit();
}); 