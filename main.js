
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('login.html');

  return mainWindow;
}

let mainWindow;
let registerWindow;

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
    },
  });

  registerWindow.loadFile('register.html');

  registerWindow.on('closed', () => {
    registerWindow = null;
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

ipcMain.on('switch-account', () => {
  if (mainWindow) {
    mainWindow.close();
    createWindow();
  }
});

ipcMain.handle('register', async (event, nickname, password) => {
  try {
    const response = await axios.post(`${API_URL}/register`, { nickname, password });
    return response.data;
  } catch (error) {
    return error.response.data;
  }
});

ipcMain.handle('login', async (event, username, password) => {
  try {
    const response = await axios.post(`${API_URL}/login`, { username, password });
    if (response.data.success) {
      if (mainWindow) {
        mainWindow.hide(); // Hide the window before loading new content
        mainWindow.loadFile('main.html');
        // Listen for the page-ready event before showing
        ipcMain.once('main-page-ready', () => {
            mainWindow.setSize(280, 600, true);
            mainWindow.center();
            mainWindow.show();
        });
      }
    }
    return response.data;
  } catch (error) {
    return error.response.data;
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

ipcMain.handle('get-avatar-path', () => {
    return store.get('avatarPath');
});

ipcMain.on('minimize-window', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
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

ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
}); 