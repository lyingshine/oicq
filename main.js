
try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store'); // Still used for avatar path
const axios = require('axios');

const store = new Store();
const API_URL = 'http://localhost:3000/api';

// 声音类型
const SOUND_TYPES = {
  ONLINE: '上线提示音',
  MESSAGE: '信息提示音',
  FRIEND_REQUEST: '加好友提示'
};

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

// 在文件顶部添加
let lastFriendsUpdateTime = 0; // 用于跟踪上次更新时间

// 修改getFriendList函数，添加更多调试信息
async function getFriendList() {
    if (!currentUserQq) {
        console.error('获取好友列表失败：用户未登录');
        return;
    }

    try {
        console.log(`开始获取QQ(${currentUserQq})的好友列表...`);
        const response = await axios.get(`${API_URL}/friends/${currentUserQq}`);
        
        if (response.data.success) {
            console.log('获取的好友数据:', response.data);

            if (!response.data.friends || !Array.isArray(response.data.friends)) {
                console.error('服务器返回的好友数据格式不正确:', response.data.friends);
                return;
            }

            // 确保好友列表数据结构正确
            friends = response.data.friends.map(friend => ({
                ...friend,
                signature: friend.signature || '这个人很懒，什么都没留下',
                status: friend.status || 'online'
            })).filter(friend => friend !== null); // 过滤掉无效项

            console.log('处理后的好友数据:', friends);
            lastFriendsUpdateTime = Date.now();

            // 重新构建好友分组
            updateFriendGroups();
        } else {
            console.error('获取好友列表失败:', response.data.message);
        }
    } catch (error) {
        console.error('获取好友列表时发生错误:', error);
    }
}

// 修改updateFriendGroups函数，增强错误处理
function updateFriendGroups() {
    console.log('开始更新好友分组...');
    try {
        if (!Array.isArray(friends)) {
            console.error('好友列表不是数组:', friends);
            friends = [];
        }
        
        // 确保好友请求分组存在
        const hasFriendRequests = friendRequests && friendRequests.length > 0;
        console.log(`有${hasFriendRequests ? friendRequests.length : 0}个好友请求`);

        // 创建默认分组
        friendGroups = [
            {
                id: 0,
                name: '我的好友',
                open: true,
                friends: [],
                total: 0,
                online: 0
            },
            {
                id: 1,
                name: '家人',
                open: false,
                friends: [],
                total: 0,
                online: 0
            },
            {
                id: 2,
                name: '同学',
                open: false,
                friends: [],
                total: 0,
                online: 0
            }
        ];
        
        // 添加好友请求分组(如果有请求)
        if (hasFriendRequests) {
            friendGroups.unshift({
                id: -1,
                name: '好友请求',
                open: true,
                friends: friendRequests,
                total: friendRequests.length,
                online: friendRequests.length,
                isRequestGroup: true
            });
        }
        
        // 分配好友到对应分组
        friends.forEach(friend => {
            if (!friend) return;
            
            let groupId = friend.groupId || 0;
            
            // 找到对应的分组
            const group = friendGroups.find(g => g.id === groupId);
            if (group) {
                group.friends.push(friend);
                group.total++;
                if (friend.online) {
                    group.online++;
                }
            } else {
                // 如果找不到分组，添加到默认分组
                console.warn(`找不到分组ID=${groupId}，将好友(QQ=${friend.qq})添加到默认分组`);
                friendGroups[0].friends.push(friend);
                friendGroups[0].total++;
                if (friend.online) {
                    friendGroups[0].online++;
                }
            }
        });

        // 移除没有好友的分组（除了前3个默认分组）
        // friendGroups = friendGroups.filter((group, index) => {
        //     return index < 3 || (group.friends && group.friends.length > 0);
        // });
        
        console.log('好友分组更新完成:', friendGroups);
        
        // 更新UI
        // renderFriendList(); // This function is not defined in the original file, so it's commented out.
    } catch (error) {
        console.error('更新好友分组时发生错误:', error);
    }
}

// 在文件中找到初始化函数，添加定期刷新好友列表的功能
function initialize() {
    // 保留原有代码
    // ...

    // 添加好友列表定期刷新
    setInterval(async () => {
        const now = Date.now();
        if (now - lastFriendsUpdateTime > 30000) { // 30秒刷新一次
            console.log('定期刷新好友列表...');
            await getFriendList();
        }
    }, 30000);
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

// 添加好友状态更新的处理程序
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
    
    // 如果是上线状态，并且之前是离线状态，通知好友并播放上线提示音
    if (status === 'online' && response.data.previousStatus === 'offline') {
        // 通知相关好友该用户上线
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friend-online', qq);
        }
    }
    
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

// 在适当的位置添加或更新好友API实现
// 获取好友列表
ipcMain.handle('get-friends', async (event, qq) => {
  try {
    console.log(`向服务器请求好友列表: QQ=${qq}`);
    const response = await axios.get(`${API_URL}/api/friends/${qq}`);
    console.log(`获取好友列表响应:`, response.data);
    return response.data;
  } catch (error) {
    console.error('获取好友列表失败:', error.message);
    return { success: false, message: error.message, friends: [] };
  }
});

// 接受好友请求
ipcMain.handle('accept-friend-request', async (event, userQq, requesterQq) => {
  try {
    console.log(`接受好友请求: 用户=${userQq}, 请求方=${requesterQq}`);
    const response = await axios.post(`${API_URL}/api/friends/accept`, {
      userQq, 
      requesterQq
    });
    console.log('接受好友请求响应:', response.data);
    
    // 如果成功，播放好友添加声音
    if (response.data.success) {
      playSound('加好友提示');
    }
    
    return response.data;
  } catch (error) {
    console.error('接受好友请求失败:', error.message);
    return { success: false, message: error.message };
  }
});

// 拒绝好友请求
ipcMain.handle('reject-friend-request', async (event, userQq, requesterQq) => {
  try {
    console.log(`拒绝好友请求: 用户=${userQq}, 请求方=${requesterQq}`);
    const response = await axios.post(`${API_URL}/api/friends/reject`, {
      userQq, 
      requesterQq
    });
    console.log('拒绝好友请求响应:', response.data);
    return response.data;
  } catch (error) {
    console.error('拒绝好友请求失败:', error.message);
    return { success: false, message: error.message };
  }
});

// 发送好友请求
ipcMain.handle('send-friend-request', async (event, senderQq, recipientQq) => {
  try {
    console.log(`发送好友请求: 发送者=${senderQq}, 接收者=${recipientQq}`);
    const response = await axios.post(`${API_URL}/api/friends/request`, {
      senderQq, 
      recipientQq
    });
    console.log('发送好友请求响应:', response.data);
    return response.data;
  } catch (error) {
    console.error('发送好友请求失败:', error.message);
    return { success: false, message: error.message };
  }
});

// 搜索用户
ipcMain.handle('search-users', async (event, term, currentUserQq) => {
  try {
    console.log(`搜索用户: 关键词=${term}, 当前用户=${currentUserQq}`);
    const response = await axios.post(`${API_URL}/api/users/search`, {
      term, 
      currentUserQq
    });
    console.log('搜索用户响应:', response.data);
    return response.data;
  } catch (error) {
    console.error('搜索用户失败:', error.message);
    return { success: false, message: error.message, users: [] };
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