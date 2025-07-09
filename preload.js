// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  login: (username, password) => ipcRenderer.invoke('login', username, password),
  register: (nickname, password) => ipcRenderer.invoke('register', nickname, password),
  openRegisterWindow: () => ipcRenderer.send('open-register-window'),
  closeRegisterWindow: () => ipcRenderer.send('close-register-window'),
  switchAccount: () => ipcRenderer.send('switch-account'),
  mainPageReady: () => ipcRenderer.send('main-page-ready'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onLoginResult: (callback) => ipcRenderer.on('login-result', (_event, value) => callback(value)),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getAvatarPath: () => ipcRenderer.invoke('get-avatar-path')
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
}); 