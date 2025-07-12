let currentFriendQq = null;
let currentUserQq = null;

// 添加消息批处理支持
let messageQueue = [];
let isProcessingMessages = false;
const MESSAGE_BATCH_SIZE = 10; // 批量渲染的消息数
const MESSAGE_PROCESS_INTERVAL = 50; // 批量处理间隔，毫秒

// 添加虚拟列表支持
let visibleMessages = [];
const MAX_VISIBLE_MESSAGES = 100; // 最大可见消息数
let isScrolledToBottom = true;

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

    // 监听滚动事件，判断是否在底部
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', () => {
            // 如果离底部不超过10px，认为是在底部
            const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 10;
            if (isNearBottom !== isScrolledToBottom) {
                isScrolledToBottom = isNearBottom;
            }
        });
    }
    
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
        
        // 清空消息队列和已显示的消息
        messageQueue = [];
        visibleMessages = [];
        clearMessageContainer();
        
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
            
            // 检查消息是否已经在队列中
            const isDuplicate = messageQueue.some(msg => 
                msg.isOutgoing && msg.content === data.content
            ) || visibleMessages.some(msg => 
                msg.isOutgoing && msg.content === data.content
            );
            
            // 如果消息不存在，则添加到消息队列
            if (!isDuplicate) {
                queueMessage({
                    content: data.content,
                    isOutgoing: true,
                    time,
                    messageId: data.messageId
                });
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
        
        const messageData = {
            content: data.message,
            isOutgoing: false,
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
            messageId: data.messageId
        };
        
        // 添加消息到队列
        queueMessage(messageData);
        
        // 确认消息已显示
        if (data.messageId) {
            window.electronAPI.confirmMessageDisplayed(data.messageId);
        }
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

// 清空消息容器
function clearMessageContainer() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    // 保留欢迎消息
    const welcomeMessage = messagesContainer.querySelector('.chat-welcome');
    messagesContainer.innerHTML = '';
    if (welcomeMessage) {
        messagesContainer.appendChild(welcomeMessage);
    }
}

// 将消息添加到队列并触发处理
function queueMessage(messageData) {
    // 添加到队列
    messageQueue.push(messageData);
    
    // 如果队列中有消息但没有正在处理，则开始处理
    if (!isProcessingMessages) {
        processMessageQueue();
    }
}

// 批量处理消息队列
function processMessageQueue() {
    if (messageQueue.length === 0) {
        isProcessingMessages = false;
        return;
    }
    
    isProcessingMessages = true;
    
    // 取出一批消息进行处理
    const batch = messageQueue.splice(0, MESSAGE_BATCH_SIZE);
    
    // 添加到DOM
    const fragment = document.createDocumentFragment();
    batch.forEach(msg => {
        const messageElement = createMessageElement(msg);
        fragment.appendChild(messageElement);
        
        // 添加到可见消息列表
        visibleMessages.push(msg);
    });
    
    // 如果可见消息超过限制，移除最早的消息
    if (visibleMessages.length > MAX_VISIBLE_MESSAGES) {
        const removeCount = visibleMessages.length - MAX_VISIBLE_MESSAGES;
        visibleMessages.splice(0, removeCount);
        
        // 从DOM中删除对应数量的旧消息
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            const messageElements = messagesContainer.querySelectorAll('.message-container');
            for (let i = 0; i < removeCount && i < messageElements.length; i++) {
                if (!messageElements[i].classList.contains('chat-welcome')) {
                    messagesContainer.removeChild(messageElements[i]);
                }
            }
        }
    }
    
    // 将片段添加到容器
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.appendChild(fragment);
        
        // 如果之前在底部，则滚动到底部
        if (isScrolledToBottom) {
            scrollToBottom();
        }
    }
    
    // 如果队列中还有消息，安排下一次处理
    if (messageQueue.length > 0) {
        setTimeout(processMessageQueue, MESSAGE_PROCESS_INTERVAL);
    } else {
        isProcessingMessages = false;
    }
}

// 滚动到底部
function scrollToBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// 创建消息元素
function createMessageElement(messageData) {
    const { content, isOutgoing, time, messageId } = messageData;
    
    const container = document.createElement('div');
    container.className = `message-container ${isOutgoing ? 'outgoing' : 'incoming'}`;
    if (messageId) {
        container.dataset.messageId = messageId;
    }
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = formatMessage(content);
    
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = time;
    
    bubble.appendChild(messageContent);
    bubble.appendChild(messageTime);
    container.appendChild(bubble);
    
    return container;
}

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
        
        // 清空现有消息
        clearMessageContainer();
        
        // 添加历史消息到队列
        if (Array.isArray(messages)) {
            console.log(`收到 ${messages.length} 条历史消息`);
            
            // 将历史消息添加到队列
            messages.forEach(msg => {
                if (!msg || typeof msg !== 'object') {
                    console.error('无效的消息格式:', msg);
                    return;
                }
                
                try {
                    queueMessage({
                        content: msg.content || '空消息',
                        isOutgoing: msg.sender === currentUserQq,
                        time: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
                        messageId: msg.messageId
                    });
                } catch (msgError) {
                    console.error('处理单条消息时出错:', msgError);
                }
            });
        } else {
            console.error('收到的消息不是数组格式:', messages);
        }
    } catch (error) {
        console.error('加载聊天历史失败:', error);
        showError('无法加载聊天历史');
    }
}

// 发送消息
function sendMessage() {
    const inputField = document.getElementById('chat-input');
    const message = inputField.value.trim();
    
    if (!message || !currentFriendQq) {
        return;
    }
    
    // 清空输入框
    inputField.value = '';
    
    // 发送消息到主进程
    window.electronAPI.sendMessage(currentFriendQq, message);
    
    // 尝试添加到UI，但不等待确认
    // 真实消息会在onMessageSentConfirmed回调中添加
    queueMessage({
        content: message,
        isOutgoing: true,
        time: new Date().toLocaleTimeString()
    });
}

// 格式化消息内容，支持简单的富文本
function formatMessage(message) {
    if (!message) return '';
    
    // 对消息内容进行HTML转义，防止XSS攻击
    const escapeHtml = (text) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    
    let formattedMessage = escapeHtml(message);
    
    // 替换换行符为<br>标签
    formattedMessage = formattedMessage.replace(/\n/g, '<br>');
    
    // 识别URL并转换为链接
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formattedMessage = formattedMessage.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    
    return formattedMessage;
}

// 显示错误提示
function showError(message) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.textContent = message;
    
    document.body.appendChild(errorContainer);
    
    // 2秒后淡出并移除
    setTimeout(() => {
        errorContainer.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(errorContainer);
        }, 500);
    }, 2000);
}

// 获取状态文本
function getStatusText(status) {
    switch(status) {
        case 'online': return '在线';
        case 'away': return '离开';
        case 'busy': return '忙碌';
        case 'invisible': return '隐身';
        default: return '离线';
    }
} 