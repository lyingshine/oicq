// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require('electron');

// 为了防止多次注册同一个事件监听器，创建一个帮助函数
function safeIpcRendererOn(channel, callback) {
  // 先移除所有此channel的监听器
  ipcRenderer.removeAllListeners(channel);
  // 再添加新的监听器
  return ipcRenderer.on(channel, callback);
}

contextBridge.exposeInMainWorld('electronAPI', {
  openRegisterWindow: () => ipcRenderer.send('open-register-window'),
  closeRegisterWindow: () => ipcRenderer.send('close-register-window'),
  switchAccount: () => ipcRenderer.send('switch-account'),
  register: (nickname, password) => ipcRenderer.invoke('register', nickname, password),
  login: (username, password) => ipcRenderer.invoke('login', username, password),
  mainPageReady: () => ipcRenderer.send('main-page-ready'),
  onUserInfo: (callback) => safeIpcRendererOn('user-info', (_event, user) => callback(user)),
  getFriends: (qq) => ipcRenderer.invoke('get-friends', qq),
  
  openAddFriendWindow: () => ipcRenderer.send('open-add-friend-window'),
  onCurrentUserQq: (callback) => safeIpcRendererOn('current-user-qq', (event, qq) => callback(qq)),
  searchUsers: (term, currentUserQq) => ipcRenderer.invoke('search-users', term, currentUserQq),
  sendFriendRequest: (senderQq, recipientQq) => ipcRenderer.invoke('send-friend-request', senderQq, recipientQq),
  acceptFriendRequest: (userQq, requesterQq) => ipcRenderer.invoke('accept-friend-request', userQq, requesterQq),
  rejectFriendRequest: (userQq, requesterQq) => ipcRenderer.invoke('reject-friend-request', userQq, requesterQq),
  onFriendRequestAccepted: (callback) => safeIpcRendererOn('friend-request-accepted', (event, newFriend) => callback(newFriend)),
  onFriendRequestRejected: (callback) => safeIpcRendererOn('friend-request-rejected', (event, requesterQq) => callback(requesterQq)),
  onFriendRequestCount: (callback) => safeIpcRendererOn('friend-request-count', (event, count) => callback(count)),
  onFriendRequest: (callback) => safeIpcRendererOn('friend-request', (_event) => callback()),
  onFriendOnline: (callback) => safeIpcRendererOn('friend-online', (_event, friendQq) => callback(friendQq)),
  onMessageReceived: (callback) => safeIpcRendererOn('message-received', (_event, sender) => callback(sender)),
  onFriendStatusUpdate: (callback) => safeIpcRendererOn('friend-status-update', (_event, payload) => callback(payload)),

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
  onAlwaysOnTopChanged: (callback) => safeIpcRendererOn('always-on-top-changed', (_event, state) => callback(state)),
  
  // 聊天相关API
  openChatWindow: (friendQq) => ipcRenderer.send('open-chat-window', friendQq),
  sendMessage: (receiverQq, message) => ipcRenderer.send('send-message', { receiverQq, message }),
  onMessageSent: (callback) => safeIpcRendererOn('message-sent', (_event, result) => callback(result)),
  onMessageSentConfirmed: (callback) => safeIpcRendererOn('message-sent-confirmed', (_event, data) => callback(data)),
  onChatMessageReceived: (callback) => safeIpcRendererOn('message-received', (_event, data) => callback(data)),
  onChatFriendInfo: (callback) => safeIpcRendererOn('chat-friend-info', (_event, data) => callback(data)),
  confirmMessageDisplayed: (messageId) => ipcRenderer.send('confirm-message-displayed', messageId),
  onMessageSendFailed: (callback) => safeIpcRendererOn('message-send-failed', (_event, data) => callback(data)),
  onMessageStoreFailed: (callback) => safeIpcRendererOn('message-store-failed', (_event, data) => callback(data)),
  
  // 新增聊天历史相关API
  getChatHistory: (otherQq) => ipcRenderer.invoke('get-chat-history', otherQq),
  markMessagesRead: (otherQq) => ipcRenderer.invoke('mark-messages-read', otherQq),
  onUnreadMessages: (callback) => safeIpcRendererOn('unread-messages', (_event, data) => callback(data)),
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