
try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store'); // Still used for avatar path
const axios = require('axios');

const store = new Store();
const API_URL = 'http://localhost:3000/api';

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 440,
    height: 330,
    frame: false, // <-- Set window to be frameless
    transparent: true, // 启用窗口透明
    resizable: false, // 禁止调整大小
    show: false, // 初始不显示窗口，等内容加载完成后再显示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('login.html');
  
  // 等待内容加载完成后再显示，避免闪烁
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });

  // 处理窗口的关闭请求
  mainWindow.on('close', (e) => {
    // 此处可以添加关闭前的确认逻辑
    // 如果需要取消关闭，可以使用 e.preventDefault()
  });

  return mainWindow;
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

  registerWindow = new BrowserWindow({
    width: 400,
    height: 450,
    frame: false,
    transparent: true,
    resizable: false,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
  });

  registerWindow.loadFile('register.html');

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
    if (!currentUserQq || !mainWindow) return;

    try {
        const count = await getFriendRequestCount();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friend-request-count', count);
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

    addFriendWindow = new BrowserWindow({
        width: 400,
        height: 400, // 增加高度以适应标签页
        parent: mainWindow,
        modal: true,
        frame: false,
        resizable: false,
        transparent: true, // 支持透明背景
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    addFriendWindow.loadFile('add-friend.html');

    addFriendWindow.webContents.on('did-finish-load', async () => {
        addFriendWindow.webContents.send('current-user-qq', currentUserQq);
    });

    addFriendWindow.on('closed', () => {
        addFriendWindow = null;
        // 关闭窗口后更新主窗口的好友请求计数
        updateMainWindowRequestCount();
    });
}


app.whenReady().then(() => {
  mainWindow = createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

ipcMain.handle('register', async (event, nickname, password) => {
  try {
    const response = await axios.post(`${API_URL}/register`, { nickname, password });
    return response.data;
  } catch (error) {
    if (error.response) {
      return error.response.data;
    } else if (error.request) {
      return { success: false, message: '无法连接到服务器。' };
    } else {
      return { success: false, message: error.message };
    }
  }
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

ipcMain.handle('dialog:openFile', async () => {
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

ipcMain.handle('get-avatar-path', async () => {
  const avatar = store.get('avatar');
  return avatar;
});

// 更新用户资料
ipcMain.handle('update-user-profile', async (event, qq, nickname, signature, avatar) => {
  console.log('收到更新用户资料请求:', { qq, nickname, signature, avatar: avatar ? '(图片数据)' : undefined });
  
  if (!qq) {
    console.error('更新资料失败：缺少QQ号码');
    return { success: false, error: '缺少QQ号码' };
  }
  
  try {
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
    console.log(`发送更新请求到: http://localhost:3000/update-profile/${qq}`);
    const response = await axios.post(`http://localhost:3000/update-profile/${qq}`, userData);
    console.log('服务器响应:', response.data);
    
    if (response.data.success) {
      // 如果成功，更新主窗口显示的用户信息
      mainWindow.webContents.send('user-info', response.data.user);
    }
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('更新用户资料失败:', error.message);
    // 检查是否是网络错误
    if (error.code === 'ECONNREFUSED') {
      return { success: false, error: '无法连接到服务器，请确保服务器已启动' };
    }
    return { success: false, error: error.message };
  }
});

// 更新用户状态
ipcMain.handle('update-status', async (event, qq, status) => {
  console.log('收到更新用户状态请求:', { qq, status });
  
  if (!qq) {
    console.error('更新状态失败：缺少QQ号码');
    return { success: false, error: '缺少QQ号码' };
  }
  
  try {
    // 准备更新的数据
    const userData = { status };
    
    // 发送到服务器
    console.log(`发送状态更新请求到: http://localhost:3000/update-status/${qq}`);
    const response = await axios.post(`http://localhost:3000/update-status/${qq}`, userData);
    console.log('服务器响应:', response.data);
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('更新用户状态失败:', error.message);
    // 检查是否是网络错误
    if (error.code === 'ECONNREFUSED') {
      return { success: false, error: '无法连接到服务器，请确保服务器已启动' };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('search-users', async (event, term, currentUserQq) => {
    try {
        const response = await axios.post(`${API_URL}/users/search`, { term, currentUserQq });
        return response.data;
    } catch (error) {
        return error.response ? error.response.data : { success: false, message: 'Network error' };
    }
});

ipcMain.handle('send-friend-request', async (event, senderQq, recipientQq) => {
    try {
        const response = await axios.post(`${API_URL}/friends/request`, { senderQq, recipientQq });
        return response.data;
    } catch (error) {
        return error.response ? error.response.data : { success: false, message: 'Network error' };
    }
});

ipcMain.handle('accept-friend-request', async (event, userQq, requesterQq) => {
    try {
        const response = await axios.post(`${API_URL}/friends/accept`, { userQq, requesterQq });
        if (response.data.success) {
            mainWindow.webContents.send('friend-request-accepted', response.data.newFriend);
            // 更新好友请求计数
            updateMainWindowRequestCount();
        }
        return response.data;
    } catch (error) {
        return error.response ? error.response.data : { success: false, message: 'Network error' };
    }
});

ipcMain.handle('reject-friend-request', async (event, userQq, requesterQq) => {
    try {
        const response = await axios.post(`${API_URL}/friends/reject`, { userQq, requesterQq });
         if (response.data.success) {
            mainWindow.webContents.send('friend-request-rejected', requesterQq);
            // 更新好友请求计数
            updateMainWindowRequestCount();
        }
        return response.data;
    } catch (error) {
        return error.response ? error.response.data : { success: false, message: 'Network error' };
    }
});


ipcMain.handle('get-friends', async (event, qq) => {
    try {
        if (!qq) {
            console.error('getFriends: qq参数为空');
            return { success: false, message: 'QQ号不能为空', friends: [], requests: [] };
        }
        console.log('获取好友列表:', qq);
        const response = await axios.get(`${API_URL}/friends/${qq}`);
        return response.data;
    } catch (error) {
        console.error('获取好友列表失败:', error);
        return { success: false, message: '获取好友列表失败', friends: [], requests: [] };
    }
});

// This is now deprecated and handled by the new request system.
ipcMain.handle('add-friend', async (event, userQq, friendQq) => {
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