// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openRegisterWindow: () => ipcRenderer.send('open-register-window'),
  closeRegisterWindow: () => ipcRenderer.send('close-register-window'),
  switchAccount: () => ipcRenderer.send('switch-account'),
  register: (nickname, password) => ipcRenderer.invoke('register', nickname, password),
  login: (username, password) => ipcRenderer.send('login', username, password),
  onLoginFailed: (callback) => ipcRenderer.on('login-failed', (event, message) => callback(message)),
  mainPageReady: () => ipcRenderer.send('main-page-ready'),
  onUserInfo: (callback) => ipcRenderer.on('user-info', (_event, user) => callback(user)),
  getFriends: (qq) => ipcRenderer.invoke('get-friends', qq),
  
  openAddFriendWindow: () => ipcRenderer.send('open-add-friend-window'),
  onCurrentUserQq: (callback) => ipcRenderer.on('current-user-qq', (event, qq) => callback(qq)),
  searchUsers: (term, currentUserQq) => ipcRenderer.invoke('search-users', term, currentUserQq),
  sendFriendRequest: (senderQq, recipientQq) => ipcRenderer.invoke('send-friend-request', senderQq, recipientQq),
  acceptFriendRequest: (userQq, requesterQq) => ipcRenderer.invoke('accept-friend-request', userQq, requesterQq),
  rejectFriendRequest: (userQq, requesterQq) => ipcRenderer.invoke('reject-friend-request', userQq, requesterQq),
  onFriendRequestAccepted: (callback) => ipcRenderer.on('friend-request-accepted', (event, newFriend) => callback(newFriend)),
  onFriendRequestRejected: (callback) => ipcRenderer.on('friend-request-rejected', (event, requesterQq) => callback(requesterQq)),
  onFriendRequestCount: (callback) => ipcRenderer.on('friend-request-count', (event, count) => callback(count)),

  // Deprecated
  addFriend: (userQq, friendQq) => ipcRenderer.invoke('add-friend', userQq, friendQq),

  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getAvatarPath: () => ipcRenderer.invoke('get-avatar-path'),

  updateUserProfile: (qq, nickname, signature, avatar) =>
  ipcRenderer.invoke('update-user-profile', qq, nickname, signature, avatar),
  
  updateStatus: (qq, status) =>
  ipcRenderer.invoke('update-status', qq, status),
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