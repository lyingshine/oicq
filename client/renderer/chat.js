let currentFriendQq = null;
let currentUserQq = null;

document.addEventListener('DOMContentLoaded', () => {
    // 设置当前时间
    document.getElementById('chat-start-time').textContent = new Date().toLocaleTimeString();
    
    // 窗口控制
    document.getElementById('minimize-btn').addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
    
    // 置顶按钮
    const pinBtn = document.getElementById('pin-btn');
    pinBtn.addEventListener('click', async () => {
        await window.electronAPI.toggleAlwaysOnTop();
        updatePinButtonState();
    });
    
    // 初始化置顶按钮状态
    updatePinButtonState();
    
    // 发送消息按钮
    const sendBtn = document.getElementById('send-btn');
    const inputField = document.getElementById('chat-input');
    
    sendBtn.addEventListener('click', () => {
        sendMessage();
    });
    
    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 聊天框点击事件，防止重启服务器
    inputField.addEventListener('click', (e) => {
        // 阻止事件冒泡，防止重复触发
        e.stopPropagation();
    });
    
    // 监听好友信息
    window.electronAPI.onChatFriendInfo(async (data) => {
        if (!data || !data.friendInfo) {
            console.error('接收到无效的好友信息');
            return;
        }
        
        currentFriendQq = data.friendInfo.qq;
        currentUserQq = data.currentUserQq;
        
        // 更新聊天窗口标题和好友信息
        const friendName = document.getElementById('chat-friend-name');
        const friendStatus = document.getElementById('chat-friend-status');
        
        if (friendName) {
            friendName.textContent = data.friendInfo.nickname;
            document.title = `与 ${data.friendInfo.nickname} 聊天`;
        }
        
        if (friendStatus) {
            friendStatus.textContent = getStatusText(data.friendInfo.status);
            friendStatus.className = `friend-status ${data.friendInfo.status}`;
        }
        
        console.log(`聊天窗口已准备好: 与 ${data.friendInfo.nickname} (${currentFriendQq}) 聊天`);
        
        // 加载聊天历史
        await loadChatHistory();
        
        // 标记消息为已读
        await window.electronAPI.markMessagesRead(currentFriendQq);
    });
    
    // 监听消息发送结果
    window.electronAPI.onMessageSent((result) => {
        if (!result.success) {
            console.error('消息发送失败:', result.error);
            showError('消息发送失败');
        }
    });
    
    // 监听消息发送确认
    if (window.electronAPI.onMessageSentConfirmed) {
        window.electronAPI.onMessageSentConfirmed((data) => {
            if (!data || !data.content) {
                console.error('接收到无效的消息确认数据');
                return;
            }
            
            // 确保消息显示在聊天窗口中
            const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
            
            // 检查消息是否已经显示
            const messageElements = document.querySelectorAll('.message-content');
            let messageExists = false;
            
            for (const element of messageElements) {
                if (element.textContent === data.content || element.innerHTML === formatMessage(data.content)) {
                    messageExists = true;
                    break;
                }
            }
            
            // 如果消息不存在，则添加
            if (!messageExists) {
                addMessage(data.content, true, time);
            }
        });
    }
    
    // 监听收到的消息
    window.electronAPI.onChatMessageReceived((data) => {
        if (!data || !data.message) {
            console.error('接收到无效的消息数据');
            return;
        }
        
        console.log('收到新消息:', data.message);
        
        // 使用更高优先级的方式添加消息
        requestAnimationFrame(() => {
            // 立即添加消息
            addMessage(data.message, false, new Date(data.timestamp || Date.now()).toLocaleTimeString(), data.messageId);
            
            // 强制DOM重绘
            document.body.style.display = 'none';
            document.body.offsetHeight; // 触发重排
            document.body.style.display = '';
            
            // 确保消息区域滚动到最新消息
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                // 双重保险：再次滚动到底部
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 50);
            }
            
            // 确认消息已显示
            try {
                window.electronAPI.confirmMessageDisplayed(data.messageId);
            } catch (error) {
                console.error('确认消息显示失败:', error);
            }
        });
    });
    
    // 监听消息发送失败
    if (window.electronAPI.onMessageSendFailed) {
        window.electronAPI.onMessageSendFailed((data) => {
            if (!data || !data.message) return;
            
            // 显示发送失败提示
            showError(`消息"${data.message.substring(0, 15)}${data.message.length > 15 ? '...' : ''}"发送失败`);
        });
    }
    
    // 监听消息存储失败
    if (window.electronAPI.onMessageStoreFailed) {
        window.electronAPI.onMessageStoreFailed((data) => {
            if (!data) return;
            
            // 显示存储失败提示
            showError('消息可能未保存到服务器');
        });
    }
    
    // 监听窗口置顶状态变化
    window.electronAPI.onAlwaysOnTopChanged((isAlwaysOnTop) => {
        updatePinButtonState(isAlwaysOnTop);
    });
});

// 更新置顶按钮状态
async function updatePinButtonState(isAlwaysOnTop = null) {
    const pinBtn = document.getElementById('pin-btn');
    if (!pinBtn) return;
    
    // 如果没有传入状态，则从主进程获取
    if (isAlwaysOnTop === null) {
        isAlwaysOnTop = await window.electronAPI.getAlwaysOnTopState();
    }
    
    // 更新按钮样式
    if (isAlwaysOnTop) {
        pinBtn.classList.add('active');
    } else {
        pinBtn.classList.remove('active');
    }
}

// 加载聊天历史
async function loadChatHistory() {
    if (!currentFriendQq || !currentUserQq) {
        console.error('无法加载聊天历史：缺少必要的用户信息');
        return;
    }
    
    try {
        console.log(`正在加载与 ${currentFriendQq} 的聊天历史`);
        const messages = await window.electronAPI.getChatHistory(currentFriendQq);
        
        // 清空现有消息（除了欢迎消息）
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) {
            console.error('找不到消息容器元素');
            return;
        }
        
        const welcomeMessage = messagesContainer.querySelector('.chat-welcome');
        messagesContainer.innerHTML = '';
        if (welcomeMessage) {
            messagesContainer.appendChild(welcomeMessage);
        }
        
        // 添加历史消息
        if (Array.isArray(messages)) {
            console.log(`收到 ${messages.length} 条历史消息`);
            messages.forEach(msg => {
                if (!msg || typeof msg !== 'object') {
                    console.error('无效的消息格式:', msg);
                    return;
                }
                
                try {
                    const isOutgoing = msg.sender === currentUserQq;
                    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                    addMessage(msg.content || '空消息', isOutgoing, time);
                } catch (msgError) {
                    console.error('处理单条消息时出错:', msgError);
                }
            });
        } else {
            console.error('收到的消息不是数组格式:', messages);
        }
        
        // 滚动到底部
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('加载聊天历史失败:', error);
        showError('无法加载聊天历史');
    }
}

// 消息缓存，用于避免重复显示
const messageCache = new Set();

// 发送消息
function sendMessage() {
    const inputField = document.getElementById('chat-input');
    const message = inputField.value.trim();
    
    if (!message || !currentFriendQq) return;
    
    // 生成消息ID用于缓存
    const localMessageId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    messageCache.add(message); // 添加到缓存
    
    // 清空输入框 - 提前清空，让用户感觉更快
    inputField.value = '';
    
    // 使用高优先级方式立即显示消息
    requestAnimationFrame(() => {
        // 在聊天窗口显示发送的消息
        addMessage(message, true, new Date().toLocaleTimeString(), localMessageId);
        
        // 强制DOM重绘
        document.body.style.display = 'none';
        document.body.offsetHeight; // 触发重排
        document.body.style.display = '';
        
        // 确保消息区域滚动到最新消息
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    });
    
    // 发送消息到主进程
    window.electronAPI.sendMessage(currentFriendQq, message);
    
    // 双重保险：再次确保消息显示并滚动
    setTimeout(() => {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, 100);
    
    // 定期清理消息缓存
    setTimeout(() => {
        messageCache.delete(message);
    }, 60000); // 1分钟后清理
}

// 添加消息到聊天窗口
function addMessage(message, isOutgoing, time = new Date().toLocaleTimeString(), messageId = null) {
    try {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) {
            console.error('找不到消息容器元素');
            return;
        }
        
        // 确保消息是字符串类型
        if (typeof message !== 'string') {
            console.error('消息不是字符串类型:', message);
            message = String(message || '');
        }
        
        // 检查消息是否在缓存中（防止重复显示）
        if (!isOutgoing && messageCache.has(message)) {
            console.log('消息已在缓存中，不重复添加');
            return;
        }
        
        // 检查消息是否已经存在于DOM中
        const formattedContent = formatMessage(message);
        const existingMessages = messagesContainer.querySelectorAll('.message-content');
        for (const existing of existingMessages) {
            if (existing.innerHTML === formattedContent) {
                console.log('消息已存在于DOM中，不重复添加');
                return;
            }
        }
        
        // 如果是接收的消息，添加到缓存
        if (!isOutgoing) {
            messageCache.add(message);
            // 1分钟后从缓存中移除
            setTimeout(() => messageCache.delete(message), 60000);
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message-container ${isOutgoing ? 'outgoing' : 'incoming'}`;
        if (messageId) {
            messageElement.dataset.messageId = messageId;
        }
        
        try {
            messageElement.innerHTML = `
                <div class="message-bubble">
                    <div class="message-content">${formattedContent}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        } catch (formatError) {
            console.error('格式化消息内容时出错:', formatError);
            messageElement.innerHTML = `
                <div class="message-bubble">
                    <div class="message-content">消息内容无法显示</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }
        
        messagesContainer.appendChild(messageElement);
        
        // 确保滚动到底部
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    } catch (error) {
        console.error('添加消息到聊天窗口时出错:', error);
    }
}

// 格式化消息内容（处理换行符等）
function formatMessage(message) {
    try {
        if (typeof message !== 'string') {
            console.error('格式化消息时收到非字符串类型:', message);
            return String(message || '');
        }
        return message.replace(/\n/g, '<br>');
    } catch (error) {
        console.error('格式化消息时出错:', error);
        return '消息格式化错误';
    }
}

// 显示错误消息
function showError(message) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    messagesContainer.appendChild(errorElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // 3秒后自动移除错误消息
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}

// 获取状态文本
function getStatusText(status) {
    switch (status) {
        case 'online': return '在线';
        case 'away': return '离开';
        case 'busy': return '忙碌';
        case 'invisible': return '隐身';
        default: return '离线';
    }
} 