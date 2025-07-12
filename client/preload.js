// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openRegisterWindow: () => ipcRenderer.send('open-register-window'),
  closeRegisterWindow: () => ipcRenderer.send('close-register-window'),
  switchAccount: () => ipcRenderer.send('switch-account'),
  register: (nickname, password) => ipcRenderer.invoke('register', nickname, password),
  login: (username, password) => ipcRenderer.invoke('login', username, password),
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
  onFriendRequest: (callback) => ipcRenderer.on('friend-request', (_event) => callback()),
  onFriendOnline: (callback) => ipcRenderer.on('friend-online', (_event, friendQq) => callback(friendQq)),
  onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, sender) => callback(sender)),
  onFriendStatusUpdate: (callback) => ipcRenderer.on('friend-status-update', (_event, payload) => callback(payload)),

  // 声音相关API
  playSound: (soundType) => ipcRenderer.send('play-sound', soundType),

  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getAvatarPath: () => ipcRenderer.invoke('get-avatar-path'),

  updateUserProfile: (qq, nickname, signature, avatar) =>
  ipcRenderer.invoke('update-user-profile', qq, nickname, signature, avatar),
  
  updateStatus: (qq, status) =>
  ipcRenderer.invoke('update-status', qq, status),
  
  // 重新生成所有用户头像
  regenerateAllAvatars: () => ipcRenderer.invoke('regenerate-all-avatars'),
  
  // 更新用户头像
  updateAvatar: (qq, avatar) => ipcRenderer.invoke('update-avatar', qq, avatar),
  
  // 窗口置顶功能
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  getAlwaysOnTopState: () => ipcRenderer.invoke('get-always-on-top-state'),
  onAlwaysOnTopChanged: (callback) => ipcRenderer.on('always-on-top-changed', (_event, state) => callback(state)),
  
  // 聊天相关API
  openChatWindow: (friendQq) => ipcRenderer.send('open-chat-window', friendQq),
  sendMessage: (receiverQq, message) => ipcRenderer.send('send-message', { receiverQq, message }),
  onMessageSent: (callback) => ipcRenderer.on('message-sent', (_event, result) => callback(result)),
  onMessageSentConfirmed: (callback) => ipcRenderer.on('message-sent-confirmed', (_event, data) => callback(data)),
  onChatMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, data) => callback(data)),
  onChatFriendInfo: (callback) => ipcRenderer.on('chat-friend-info', (_event, data) => callback(data)),
  confirmMessageDisplayed: (messageId) => ipcRenderer.send('confirm-message-displayed', messageId),
  onMessageSendFailed: (callback) => ipcRenderer.on('message-send-failed', (_event, data) => callback(data)),
  onMessageStoreFailed: (callback) => ipcRenderer.on('message-store-failed', (_event, data) => callback(data)),
  
  // 新增聊天历史相关API
  getChatHistory: (otherQq) => ipcRenderer.invoke('get-chat-history', otherQq),
  markMessagesRead: (otherQq) => ipcRenderer.invoke('mark-messages-read', otherQq),
  onUnreadMessages: (callback) => ipcRenderer.on('unread-messages', (_event, data) => callback(data)),
  
  // 窗口控制API
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  getAlwaysOnTopState: () => ipcRenderer.invoke('get-always-on-top-state'),
  onAlwaysOnTopChanged: (callback) => ipcRenderer.on('always-on-top-changed', (_event, state) => callback(state)),
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