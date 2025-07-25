let localFriends = [];
let localRequests = [];

document.addEventListener('DOMContentLoaded', () => {
    // 全局用户变量
    window.currentUser = null;

    // DOM 元素获取
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');
    const pinBtn = document.getElementById('pin-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const mainMenuPopup = document.getElementById('main-menu-popup');
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const regenerateAvatarsBtn = document.getElementById('regenerate-avatars-btn');
    const addFriendBtn = document.getElementById('add-friend-btn');
    const refreshFriendsBtn = document.getElementById('refresh-friends-btn');
    const avatarStatusIcon = document.getElementById('avatar-status-icon');
    const statusMenuPopup = document.getElementById('status-menu-popup');

    // 初始化用户信息显示
    initializeUserInfo();

    // 窗口控制
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    
    // 初始化置顶按钮状态
    initPinButtonState();
    
    // 置顶按钮点击事件
    pinBtn.addEventListener('click', () => {
        window.electronAPI.toggleAlwaysOnTop();
    });
    
    // 监听置顶状态变化
    window.electronAPI.onAlwaysOnTopChanged((isAlwaysOnTop) => {
        updatePinButtonState(isAlwaysOnTop);
    });

    // 主菜单
    mainMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mainMenuPopup.classList.toggle('show');
    });

    // 切换账号
    switchAccountBtn.addEventListener('click', async () => {
        await window.electronAPI.switchAccount();
    });

    // 重新生成头像
    regenerateAvatarsBtn.addEventListener('click', async () => {
        mainMenuPopup.classList.remove('show');
        await regenerateAllAvatars();
    });

    // 添加好友
    addFriendBtn.addEventListener('click', () => {
        window.electronAPI.openAddFriendWindow();
    });

    // 刷新好友列表
    if (refreshFriendsBtn) {
        refreshFriendsBtn.addEventListener('click', () => {
            if (window.currentUser) {
                getAndRenderFriendList(window.currentUser.qq);
            }
        });
    }

    // 状态切换
    if (avatarStatusIcon) {
        console.log('添加状态图标点击事件');
        avatarStatusIcon.addEventListener('click', (e) => {
            console.log('状态图标被点击');
            e.stopPropagation();
            e.preventDefault();
            toggleStatusMenu(e);
        });
    }

    if (statusMenuPopup) {
        console.log('添加状态菜单点击事件');
        
        // 防止点击菜单时关闭菜单
        statusMenuPopup.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('状态菜单被点击', e.target);
            const statusItem = e.target.closest('li');
            if (statusItem) {
                const status = statusItem.dataset.status;
                console.log('选择状态:', status);
                updateStatus(status);
                
                // 直接隐藏菜单
                statusMenuPopup.style.display = 'none';
            }
        });
    }

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        // 关闭主菜单
        if (!mainMenuPopup.contains(e.target) && e.target.id !== 'main-menu-btn') {
            mainMenuPopup.classList.remove('show');
        }
        
        // 关闭状态菜单
        const statusMenuPopup = document.getElementById('status-menu-popup');
        if (statusMenuPopup && !statusMenuPopup.contains(e.target) && e.target.id !== 'avatar-status-icon') {
            console.log('点击了状态菜单外部，隐藏菜单');
            statusMenuPopup.style.display = 'none';
        }
    });

    // 告知主进程页面已准备好接收数据
    window.electronAPI.mainPageReady();
});

// 初始化用户信息
function initializeUserInfo() {
    try {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            const user = JSON.parse(savedUser);
            window.currentUser = user;
            applyUserInfoToUI(user);
            getAndRenderFriendList(user.qq);
        }
    } catch (error) {
        console.error('初始化用户信息失败:', error);
    }
}

// 添加一个标志，表示是否正在进行状态更新操作
let isStatusUpdateInProgress = false;
// 添加请求ID跟踪
let lastStatusUpdateId = 0;
let pendingStatusUpdates = new Map();

window.electronAPI.onUserInfo((user) => {
    if (!user) {
        console.error('收到的用户信息无效');
        return;
    }

    console.log('收到用户信息:', user);
    
    // 检查是否只是状态更新
    const previousUser = window.currentUser;
    const isStatusUpdate = previousUser && 
                         previousUser.qq === user.qq && 
                         previousUser.status !== user.status;

    // 如果是从隐身切换到在线，播放提示音
    if (isStatusUpdate && previousUser.status === 'invisible' && user.status === 'online') {
        const audio = new Audio('../sound/上线提示音.mp3');
        audio.play().catch(e => console.error('播放上线提示音失败:', e));
    }
    
    // 检查状态更新逻辑
    if (isStatusUpdate) {
        console.log(`检测到状态更新: ${previousUser.status} -> ${user.status}`);
        
        // 如果当前正在进行状态更新操作，跳过服务器返回的状态更新
        if (isStatusUpdateInProgress) {
            console.log('检测到状态更新操作正在进行中，跳过服务器自动更新');
            return;
        }
        
        // 检查是否有最新的待处理状态更新
        if (pendingStatusUpdates.size > 0 && lastStatusUpdateId > 0) {
            const latestUpdate = pendingStatusUpdates.get(lastStatusUpdateId);
            if (latestUpdate && latestUpdate.status !== user.status) {
                console.warn(`服务器返回状态 ${user.status} 与最新请求状态 ${latestUpdate.status} 不匹配，保持最新请求状态`);
                return;
            }
        }
    }
    
    // 更新全局用户对象
    console.log('更新全局用户对象:', user);
    window.currentUser = user;
    
    // 保存到本地存储
    try {
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('用户信息已保存到本地存储');
    } catch (error) {
        console.error('保存用户信息到本地存储失败:', error);
    }

    // 更新UI
    console.log('正在更新UI...');
    applyUserInfoToUI(user);
    console.log('UI更新完成');
    
    // 如果不是仅状态更新，则更新好友列表
    if (!isStatusUpdate) {
        console.log('更新好友列表');
        getAndRenderFriendList(user.qq);
    }
});

window.electronAPI.onFriendRequest(() => {
    if (window.currentUser) {
        getAndRenderFriendList(window.currentUser.qq);
    }
});

window.electronAPI.onFriendRequestCount((count) => {
    const badge = document.getElementById('friend-request-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
});

// Listen for friend status updates
window.electronAPI.onFriendStatusUpdate((payload) => {
    console.log('收到好友状态更新:', payload);
    const { qq, status } = payload;
    
    const friend = localFriends.find(f => f.qq === qq);
    if (friend) {
        console.log(`更新本地好友 ${qq} 的状态为 ${status}`);
        friend.status = status;
        
        // 从更新后的本地缓存重新构建和渲染好友列表
        const friendGroups = buildFriendGroups(localFriends, localRequests);
        renderFriendList(friendGroups);
    } else {
        // 如果在本地缓存中找不到好友，可能是新加的好友，执行一次完整刷新
        if (window.currentUser) {
            getAndRenderFriendList(window.currentUser.qq);
        }
    }
});

window.electronAPI.onFriendOnline((payload) => {
    console.log(`好友 ${payload.qq} 已上线，正在刷新列表...`);
    if (window.currentUser) {
        getAndRenderFriendList(window.currentUser.qq);
    }
});

// 监听未读消息通知
window.electronAPI.onUnreadMessages((unreadMessages) => {
    console.log('收到未读消息通知:', unreadMessages);
    
    // 获取所有好友元素
    const friendElements = document.querySelectorAll('.friend-item');
    
    // 先清除所有未读消息和闪烁效果
    friendElements.forEach(element => {
        const avatar = element.querySelector('.friend-avatar');
        const unreadBadge = element.querySelector('.unread-badge');
        
        // 检查该好友是否有未读消息
        const friendQq = element.dataset.qq;
        const hasUnread = unreadMessages && unreadMessages[friendQq] > 0;
        
        // 如果没有未读消息，清除闪烁效果和徽章
        if (!hasUnread) {
            if (avatar) avatar.classList.remove('avatar-flashing');
            if (unreadBadge) unreadBadge.style.display = 'none';
        }
    });
    
    // 遍历有未读消息的好友
    for (const friendQq in unreadMessages) {
        const count = unreadMessages[friendQq];
        
        // 如果没有未读消息，跳过
        if (!count || count <= 0) continue;
        
        // 找到对应的好友元素
        const friendElement = document.querySelector(`.friend-item[data-qq="${friendQq}"]`);
        if (friendElement) {
            // 更新或创建未读消息指示器
            let unreadBadge = friendElement.querySelector('.unread-badge');
            if (!unreadBadge) {
                unreadBadge = document.createElement('span');
                unreadBadge.className = 'unread-badge';
                // 直接添加到好友列表项
                friendElement.appendChild(unreadBadge);
            }
            
            // 设置未读消息数量
            unreadBadge.textContent = count > 99 ? '99+' : count;
            unreadBadge.style.display = 'block';
            
            // 添加头像闪烁效果
            const avatar = friendElement.querySelector('.friend-avatar');
            if (avatar) {
                avatar.classList.add('avatar-flashing');
            }
            
            // 将该好友移动到列表顶部
            const friendsList = document.getElementById('friends-list');
            if (friendsList && friendsList.firstChild !== friendElement) {
                friendsList.insertBefore(friendElement, friendsList.firstChild);
            }
        }
    }
});

// 用于跟踪消息处理状态的Map
const messageProcessingStatus = new Map();

// 监听收到新消息
window.electronAPI.onMessageReceived((data) => {
    const { senderQq } = data;
    
    // 防止重复处理同一消息
    const now = Date.now();
    const lastProcessed = messageProcessingStatus.get(senderQq) || 0;
    
    // 如果两次消息处理间隔小于500ms，不重复处理闪烁效果
    const shouldProcessFullEffect = now - lastProcessed > 500;
    
    // 更新最后处理时间
    messageProcessingStatus.set(senderQq, now);
    
    // 播放消息提示音
    if (shouldProcessFullEffect) {
        window.electronAPI.playSound('MESSAGE');
    }
    
    // 找到对应的好友元素
    const friendElement = document.querySelector(`.friend-item[data-qq="${senderQq}"]`);
    if (friendElement) {
        // 更新或创建未读消息指示器
        let unreadBadge = friendElement.querySelector('.unread-badge');
        if (!unreadBadge) {
            unreadBadge = document.createElement('span');
            unreadBadge.className = 'unread-badge';
            // 将未读消息指示器直接添加到好友项目中
            friendElement.appendChild(unreadBadge);
        }
        
        // 增加未读消息数量
        const currentCount = parseInt(unreadBadge.textContent) || 0;
        unreadBadge.textContent = currentCount + 1 > 99 ? '99+' : (currentCount + 1);
        unreadBadge.style.display = 'block';
        
        // 添加头像闪烁效果，但避免频繁添加
        if (shouldProcessFullEffect) {
            const avatar = friendElement.querySelector('.friend-avatar');
            if (avatar) {
                // 先移除再添加，确保动画重新开始
                avatar.classList.remove('avatar-flashing');
                setTimeout(() => {
                    avatar.classList.add('avatar-flashing');
                }, 10);
            }
            
            // 将该好友移动到列表顶部
            const friendsList = document.getElementById('friends-list');
            if (friendsList && friendsList.firstChild !== friendElement) {
                friendsList.insertBefore(friendElement, friendsList.firstChild);
            }
        }
    }
    
    // 5分钟后清除消息处理状态
    setTimeout(() => {
        messageProcessingStatus.delete(senderQq);
    }, 300000); // 5分钟
});

// 函数定义
// 状态菜单相关函数
// 完全重写状态菜单的显示和隐藏函数
function toggleStatusMenu(event) {
    console.log('切换状态菜单');
    
    // 获取菜单元素
    const statusMenuPopup = document.getElementById('status-menu-popup');
    if (!statusMenuPopup) {
        console.error('状态菜单元素未找到');
        return;
    }
    
    // 检查菜单是否已经可见
    const isVisible = window.getComputedStyle(statusMenuPopup).display !== 'none';
    
    if (isVisible) {
        // 隐藏菜单
        statusMenuPopup.style.display = 'none';
        console.log('状态菜单已隐藏');
    } else {
        // 显示菜单并定位
        const avatarStatusIcon = document.getElementById('avatar-status-icon');
        if (avatarStatusIcon) {
            const rect = avatarStatusIcon.getBoundingClientRect();
            console.log('头像状态图标位置:', rect);
            
            // 强制显示菜单
            statusMenuPopup.style.display = 'block';
            statusMenuPopup.style.opacity = '1';
            statusMenuPopup.style.transform = 'translateY(0)';
            
            // 设置位置
            statusMenuPopup.style.top = `${rect.bottom + 5}px`;
            statusMenuPopup.style.right = '10px';
            statusMenuPopup.style.left = 'auto';
            
            console.log('状态菜单已显示');
        }
    }
}

// 修改状态更新函数
async function updateStatus(status) {
    if (!window.currentUser) {
        console.error('无法更新状态：用户未登录');
        return;
    }
    
    // 记录用户之前的状态，用于回退
    const previousStatus = window.currentUser.status;
    
    // 生成唯一请求ID
    const updateId = ++lastStatusUpdateId;
    
    try {
        console.log(`开始状态更新操作 #${updateId}: ${previousStatus} -> ${status}`);
        isStatusUpdateInProgress = true;
        
        // 存储此次更新操作
        pendingStatusUpdates.set(updateId, {
            status,
            previousStatus,
            timestamp: Date.now()
        });
        
        // 乐观地更新UI
        optimisticStatusUpdate(status);
        
        // 发送请求到服务器
        const response = await window.electronAPI.updateStatus(window.currentUser.qq, status);
        
        // 检查是否为当前最新的状态更新请求
        if (updateId !== lastStatusUpdateId) {
            console.warn(`状态更新 #${updateId} 不是最新请求，已被更新请求 #${lastStatusUpdateId} 覆盖`);
            // 不需要进一步处理，因为有更新的请求
            return;
        }
        
        if (!response.success) {
            console.error('状态更新失败:', response.message);
            
            // 回退状态
            optimisticStatusUpdate(previousStatus);
            
            // 显示错误提示
            showNotification(`状态更新失败: ${response.message}`, 'error');
            return;
        }
        
        console.log(`状态更新成功: ${previousStatus} -> ${status}`);
        
        // 清理已完成的状态更新请求
        pendingStatusUpdates.delete(updateId);
        
    } catch (error) {
        console.error('更新状态时出错:', error);
        
        // 回退状态
        optimisticStatusUpdate(previousStatus);
        
        // 显示错误提示
        showNotification('状态更新失败，请稍后重试', 'error');
    } finally {
        // 延迟一点再重置标志，确保不会与onUserInfo回调冲突
        setTimeout(() => {
            isStatusUpdateInProgress = false;
            console.log('状态更新操作完成，重置状态更新标志');
        }, 500);
    }
}

// 乐观的UI更新函数，用于在服务器响应前更新UI
function optimisticStatusUpdate(status) {
    if (!window.currentUser) return;
    
    // 更新全局状态
    window.currentUser.status = status;
    
    // 更新状态图标
    updateStatusIcon(status);
    
    // 保存到本地存储
    try {
        localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
    } catch (error) {
        console.error('保存用户状态到本地存储失败:', error);
    }
}

// 更新状态图标
function updateStatusIcon(status) {
    const statusIcon = document.getElementById('avatar-status-icon');
    if (!statusIcon) return;
    
    // 移除所有状态类名
    statusIcon.classList.remove('online', 'away', 'busy', 'invisible');
    
    // 添加新状态类名
    statusIcon.classList.add(status);
}

// 显示通知的辅助函数
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44b549' : '#3498db'};
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: fadeIn 0.3s, fadeOut 0.3s 2.7s;
        opacity: 0;
    `;
    
    // 添加动画样式（如果还没有）
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    notification.innerHTML = `<strong>${type === 'error' ? '错误' : type === 'success' ? '成功' : '通知'}:</strong> ${message}`;
    document.body.appendChild(notification);
    
    // 显示通知
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // 几秒后自动移除
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300); // 等待淡出动画完成
    }, 3000);
}

// 获取状态文本
function getStatusText(status) {
    // Define the mapping from status to display text
    const statusMap = {
        'online': '在线',
        'away': '离开',
        'busy': '忙碌',
        'invisible': '隐身', // Invisible shows as offline to others
        'offline': '隐身'
    };
    return statusMap[status] || '隐身'; // Default to offline for friends
}

// 更新用户信息到UI
function applyUserInfoToUI(user) {
    if (!user) return;

    // 更新全局变量
    window.currentUser = user;

    const elements = {
        avatar: document.getElementById('main-avatar-img'),
        nickname: document.getElementById('nickname'),
        signature: document.getElementById('signature-text'),
        statusIcon: document.getElementById('avatar-status-icon')
    };

    if (elements.avatar) {
        elements.avatar.src = user.avatar || 'assets/logo.png';
        // 添加点击事件监听器以显示资料卡
        elements.avatar.addEventListener('click', showProfileCard);
    }
    if (elements.nickname) elements.nickname.textContent = user.nickname || '未设置昵称';
    if (elements.signature) elements.signature.textContent = user.signature || '编辑个性签名';
    if (elements.statusIcon) {
        elements.statusIcon.className = `status-icon ${user.status || 'online'}`;
        elements.statusIcon.setAttribute('data-status', user.status || 'online');
    }
    
    // 将用户信息保存到本地存储，以便在重新加载时恢复
    try {
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (error) {
        console.error('保存用户信息失败:', error);
    }
}

async function getAndRenderFriendList(qq) {
    try {
        console.log('[RENDERER] 开始获取好友列表, QQ:', qq);
        const response = await window.electronAPI.getFriends(qq);
        console.log('[RENDERER] 从主进程获取好友列表响应:', JSON.stringify(response, null, 2));

        if (!response || !response.success) {
            throw new Error(response.message || '获取好友列表失败');
        }

        // 更新本地缓存
        localFriends = response.friends || [];
        localRequests = response.requests || [];

        const friendGroups = buildFriendGroups(localFriends, localRequests);
        renderFriendList(friendGroups);
    } catch (error) {
        console.error('[RENDERER] 获取或渲染好友列表失败:', error);
        const friendListEl = document.querySelector('.friend-list');
        if (friendListEl) {
            friendListEl.innerHTML = `
                <div class="error-message" style="padding: 20px; color: #ff4444; text-align: center;">
                    <i class="fas fa-exclamation-circle"></i>
                    <div>获取好友列表失败</div>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">${error.message}</div>
                </div>
            `;
        }
    }
}

function buildFriendGroups(friends = [], requests = []) {
    console.log('[RENDERER] 构建好友分组, 好友数:', friends.length, '请求数:', requests.length);
    
    // 默认分组
    const groups = [
        { id: 0, name: '我的好友', open: true, friends: [] },
        { id: 1, name: '家人', open: false, friends: [] },
        { id: 2, name: '同学', open: false, friends: [] }
    ];

    // 添加好友请求分组
    if (requests && requests.length > 0) {
        groups.unshift({
            id: -1,
            name: `好友请求 (${requests.length})`,
            open: true,
            friends: requests.map(r => ({ ...r, isRequest: true }))
        });
    }

    // 分配好友到对应分组
    if (friends && friends.length > 0) {
        friends.forEach(friend => {
            const groupId = friend.groupId || 0;
            const group = groups.find(g => g.id === groupId);
            if (group) {
                group.friends.push({ ...friend, isRequest: false });
            } else {
                groups[0].friends.push({ ...friend, isRequest: false });
            }
        });
    }

    // Sort friends within each group: online first
    groups.forEach(group => {
        if (group.friends && group.id !== -1) { // Don't sort requests group
            group.friends.sort((a, b) => {
                const aIsOnline = a.status === 'online';
                const bIsOnline = b.status === 'online';
                if (aIsOnline && !bIsOnline) return -1;
                if (!aIsOnline && bIsOnline) return 1;
                return (a.nickname || '').localeCompare(b.nickname || ''); // Then sort by name
            });
        }
    });

    // 只返回有好友的分组
    const finalGroups = groups.filter(g => g.friends.length > 0);
    console.log('[RENDERER] 最终分组结果:', JSON.stringify(finalGroups, null, 2));
    return finalGroups;
}

function renderFriendList(groups) {
    const friendListContainer = document.querySelector('.friend-list');
    if (!friendListContainer) {
        console.error('[RENDERER] 好友列表容器未找到');
        return;
    }
    friendListContainer.innerHTML = '';
    console.log('[RENDERER] 开始渲染好友列表, 分组数:', groups.length);

    if (groups.length === 0) {
        friendListContainer.innerHTML = '<div class="no-friends-message" style="padding: 20px; text-align: center; color: #888;">你还没有好友，快去添加吧！</div>';
        console.log('[RENDERER] 没有好友可以渲染');
        return;
    }

    let totalFriendsRendered = 0;

    for (const group of groups) {
        const groupElement = document.createElement('div');
        groupElement.className = 'friend-group';
        
        const onlineCount = group.friends.filter(f => f.status === 'online' && !f.isRequest).length;
        const totalCount = group.isRequest ? group.friends.length : group.friends.filter(f => !f.isRequest).length;

        groupElement.innerHTML = `
            <div class="group-title">
                <i class="fas fa-chevron-right"></i>
                <span>${group.name}</span>
                <span class="online-count">${onlineCount}/${totalCount}</span>
            </div>
        `;
        
        const listElement = document.createElement('ul');
        listElement.className = 'friend-sublist';
        listElement.style.display = group.open ? 'block' : 'none';

        group.friends.forEach(friend => {
            totalFriendsRendered++;
            const isSelf = window.currentUser && friend.qq === window.currentUser.qq;
            
            // 根据好友状态确定类名
            let statusClass = '';
            let statusText = '';
            
            switch (friend.status) {
                case 'online':
                    statusClass = 'online';
                    statusText = '在线';
                    break;
                case 'away':
                    statusClass = 'away';
                    statusText = '离开';
                    break;
                case 'busy':
                    statusClass = 'busy';
                    statusText = '忙碌';
                    break;
                case 'invisible':
                    statusClass = 'invisible';
                    statusText = '隐身';
                    break;
                default:
                    statusClass = 'offline';
                    statusText = '离线';
            }
            
            // 如果是自己，强制显示为在线
            if (isSelf) {
                statusClass = 'online';
                statusText = '在线';
            }

            const friendElement = document.createElement('li');
            friendElement.className = `friend-item ${statusClass}`;
            friendElement.dataset.qq = friend.qq;

            if (friend.isRequest) {
                friendElement.innerHTML = `
                    <div class="friend-avatar">
                        <img src="${friend.avatar || '../assets/logo.png'}" alt="avatar">
                    </div>
                    <div class="friend-info">
                        <div class="friend-name">${friend.nickname}</div>
                    </div>
                    <div class="request-actions">
                        <button class="accept-btn">接受</button>
                        <button class="reject-btn">拒绝</button>
                    </div>
                `;
                friendElement.querySelector('.accept-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    acceptRequest(friend.qq);
                });
                friendElement.querySelector('.reject-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    rejectRequest(friend.qq);
                });
            } else {
                friendElement.innerHTML = `
                    <div class="friend-avatar ${statusClass}">
                        <img src="${friend.avatar || '../assets/logo.png'}" alt="avatar">
                        <div class="status-icon-small ${statusClass}"></div>
                    </div>
                    <div class="friend-info">
                        <div class="friend-name-row">
                            <div class="friend-name">${friend.nickname}</div>
                        </div>
                        <div class="friend-signature">${friend.signature || ''}</div>
                    </div>
                `;
                
                // 添加头像单击事件 - 查看好友资料
                const avatarElement = friendElement.querySelector('.friend-avatar');
                if (avatarElement) {
                    avatarElement.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止事件冒泡
                        showFriendProfile(friend);
                    });
                }
                
                // 添加好友项双击事件 - 打开聊天框
                friendElement.addEventListener('dblclick', () => {
                    openChatWindow(friend);
                });
            }

            listElement.appendChild(friendElement);
        });

        groupElement.appendChild(listElement);
        friendListContainer.appendChild(groupElement);

        groupElement.querySelector('.group-title').addEventListener('click', () => {
            listElement.style.display = listElement.style.display === 'none' ? 'block' : 'none';
            groupElement.querySelector('.fa-chevron-right').classList.toggle('rotated');
        });
    }
    console.log(`[RENDERER] 渲染完成, 共渲染了 ${totalFriendsRendered} 个好友/请求`);
}

// 接受好友请求
async function acceptRequest(requesterQq) {
    if (!window.currentUser) return;
    
    try {
        const response = await window.electronAPI.acceptFriendRequest(window.currentUser.qq, requesterQq);
        if (response.success) {
            await getAndRenderFriendList(window.currentUser.qq);
        } else {
            alert('接受好友请求失败: ' + response.message);
        }
    } catch (error) {
        console.error('接受好友请求失败:', error);
        alert('接受好友请求失败');
    }
}

async function rejectRequest(requesterQq) {
    if (!window.currentUser) return;
    
    try {
        const response = await window.electronAPI.rejectFriendRequest(window.currentUser.qq, requesterQq);
        if (response.success) {
            await getAndRenderFriendList(window.currentUser.qq);
        } else {
            alert('拒绝好友请求失败: ' + response.message);
        }
    } catch (error) {
        console.error('拒绝好友请求失败:', error);
        alert('拒绝好友请求失败');
    }
}

// 显示个人资料卡
function showProfileCard() {
    const card = document.createElement('div');
    card.id = 'profile-card';
    card.className = 'profile-card';
    card.innerHTML = `
        <div class="profile-card-header">
            <h4>编辑资料</h4>
            <button id="close-profile-card" class="close-btn">&times;</button>
        </div>
        <div class="profile-card-body">
            <div class="profile-avatar-wrapper">
                <img src="${window.currentUser.avatar || 'assets/logo.png'}" id="profile-card-avatar" class="profile-card-avatar" alt="Avatar">
                <div class="profile-avatar-overlay">点击更换</div>
            </div>
            <div class="avatar-options">
                <button id="upload-avatar-btn" class="avatar-option-btn">上传头像</button>
                <button id="generate-avatar-btn" class="avatar-option-btn">生成头像</button>
            </div>
            <p>QQ: ${window.currentUser.qq}</p>
            <input type="text" id="profile-nickname" value="${window.currentUser.nickname || ''}" placeholder="昵称">
            <input type="text" id="profile-signature" value="${window.currentUser.signature || ''}" placeholder="个性签名">
        </div>
        <div class="profile-card-footer">
            <button id="save-profile-changes" class="save-btn">保存</button>
        </div>
    `;
    document.body.appendChild(card);

    // 事件监听
    document.getElementById('close-profile-card').addEventListener('click', () => card.remove());
    document.getElementById('save-profile-changes').addEventListener('click', handleProfileSave);
    
    // 为上传头像按钮添加点击事件
    document.getElementById('upload-avatar-btn').addEventListener('click', async () => {
        // 直接获取Base64格式的图片数据
        const avatarBase64 = await window.electronAPI.openFileDialog();
        if (avatarBase64) {
            console.log('获取到头像Base64数据，长度:', avatarBase64.length);
            
            // 更新头像预览
            const profileAvatar = document.getElementById('profile-card-avatar');
            profileAvatar.src = avatarBase64;
            
            // 直接更新头像，不需要等待保存按钮
            await updateUserAvatar(avatarBase64);
        } else {
            console.log('用户取消了头像选择或处理失败');
        }
    });
    
    // 为生成头像按钮添加点击事件
    document.getElementById('generate-avatar-btn').addEventListener('click', async () => {
        const nickname = document.getElementById('profile-nickname').value || window.currentUser.nickname;
        const firstChar = nickname.charAt(0).toUpperCase();
        const bgColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        
        // 创建SVG头像
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                <rect x="0" y="0" width="100" height="100" fill="${bgColor}"/>
                <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="50" fill="#fff">${firstChar}</text>
            </svg>
        `;
        
        // 将SVG转换为Base64
        const base64Avatar = `data:image/svg+xml;base64,${btoa(svg)}`;
        
        // 更新头像预览
        const profileAvatar = document.getElementById('profile-card-avatar');
        profileAvatar.src = base64Avatar;
        
        // 直接更新头像
        await updateUserAvatar(base64Avatar);
    });
}

// 处理资料保存
async function handleProfileSave() {
    const nickname = document.getElementById('profile-nickname').value;
    const signature = document.getElementById('profile-signature').value;
    
    // 只更新昵称和签名
    const result = await window.electronAPI.updateUserProfile(
        window.currentUser.qq,
        nickname,
        signature,
        null // 不通过这个API更新头像
    );

    if (result.success) {
        // 更新UI
        applyUserInfoToUI(result.data.user);
        // 关闭资料卡
        document.getElementById('profile-card').remove();
        showNotification('资料更新成功', 'success');
    } else {
        showNotification(`更新失败: ${result.message}`, 'error');
    }
}

// 更新用户头像
async function updateUserAvatar(avatarBase64) {
    if (!window.currentUser || !avatarBase64) {
        console.error('无法更新头像: 用户未登录或头像数据为空');
        return false;
    }
    
    try {
        console.log('发送头像更新请求, 数据长度:', avatarBase64.length);
        const result = await window.electronAPI.updateAvatar(window.currentUser.qq, avatarBase64);
        console.log('头像更新服务器响应:', result);
        
        if (result.success) {
            // 更新本地用户信息
            window.currentUser.avatar = avatarBase64;
            
            // 更新UI
            const avatarImg = document.getElementById('main-avatar-img');
            if (avatarImg) {
                avatarImg.src = avatarBase64;
                console.log('头像UI已更新');
            }
            
            // 刷新好友列表，确保显示最新的头像
            if (window.currentUser) {
                console.log('刷新好友列表');
                getAndRenderFriendList(window.currentUser.qq);
            }
            
            showNotification('头像更新成功', 'success');
            return true;
        } else {
            console.error('头像更新失败:', result.message);
            showNotification(`头像更新失败: ${result.message}`, 'error');
            return false;
        }
    } catch (error) {
        console.error('头像更新异常:', error);
        showNotification('头像更新失败，请稍后再试', 'error');
        return false;
    }
}

// 重新生成所有用户头像
async function regenerateAllAvatars() {
    try {
        const result = await window.electronAPI.regenerateAllAvatars();
        if (result.success) {
            showNotification('所有用户头像已重新生成', 'success');
            // 如果当前用户已登录，刷新好友列表
            if (window.currentUser) {
                getAndRenderFriendList(window.currentUser.qq);
            }
        } else {
            showNotification('重新生成头像失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('重新生成头像失败:', error);
        showNotification('重新生成头像失败，请稍后再试', 'error');
    }
} 

// 初始化置顶按钮状态
async function initPinButtonState() {
    try {
        const isAlwaysOnTop = await window.electronAPI.getAlwaysOnTopState();
        updatePinButtonState(isAlwaysOnTop);
    } catch (error) {
        console.error('获取置顶状态失败:', error);
    }
}

// 更新置顶按钮状态
function updatePinButtonState(isAlwaysOnTop) {
    const pinBtn = document.getElementById('pin-btn');
    if (pinBtn) {
        if (isAlwaysOnTop) {
            pinBtn.classList.add('active');
            pinBtn.title = '取消置顶';
        } else {
            pinBtn.classList.remove('active');
            pinBtn.title = '置顶窗口';
        }
    }
} 

// 显示好友资料卡
function showFriendProfile(friend) {
    // 如果已经存在资料卡，先移除
    const existingCard = document.getElementById('friend-profile-card');
    if (existingCard) {
        existingCard.remove();
    }

    const card = document.createElement('div');
    card.id = 'friend-profile-card';
    card.className = 'profile-card';
    card.innerHTML = `
        <div class="profile-card-header">
            <h4>好友资料</h4>
            <button id="close-friend-profile" class="close-btn">&times;</button>
        </div>
        <div class="profile-card-body">
            <div class="profile-avatar-wrapper">
                <img src="${friend.avatar || '../assets/logo.png'}" class="profile-card-avatar" alt="Avatar">
            </div>
            <p><strong>QQ:</strong> ${friend.qq}</p>
            <p><strong>昵称:</strong> ${friend.nickname}</p>
            <p><strong>状态:</strong> <span class="friend-status ${friend.status}">${getStatusText(friend.status)}</span></p>
            <p><strong>个性签名:</strong> ${friend.signature || '这个人很懒，什么都没留下'}</p>
        </div>
        <div class="profile-card-footer">
            <button id="chat-with-friend" class="chat-btn">发送消息</button>
            <button id="delete-friend" class="delete-btn">删除好友</button>
        </div>
    `;
    document.body.appendChild(card);

    // 事件监听
    document.getElementById('close-friend-profile').addEventListener('click', () => card.remove());
    
    // 发送消息按钮
    document.getElementById('chat-with-friend').addEventListener('click', () => {
        card.remove();
        openChatWindow(friend);
    });
    
    // 删除好友按钮
    document.getElementById('delete-friend').addEventListener('click', async () => {
        if (confirm(`确定要删除好友 ${friend.nickname} 吗？`)) {
            try {
                // 这里需要实现删除好友的API
                showNotification('删除好友功能尚未实现', 'info');
                card.remove();
            } catch (error) {
                console.error('删除好友失败:', error);
                showNotification('删除好友失败', 'error');
            }
        }
    });
}

// 打开聊天窗口
function openChatWindow(friend) {
    if (!friend || !friend.qq) {
        console.error('无法打开聊天窗口：好友信息不完整');
        return;
    }
    
    try {
        // 清除未读消息指示器和闪烁效果
        const friendElement = document.querySelector(`.friend-item[data-qq="${friend.qq}"]`);
        if (friendElement) {
            const unreadBadge = friendElement.querySelector('.unread-badge');
            if (unreadBadge) {
                unreadBadge.style.display = 'none';
                unreadBadge.textContent = '0'; // 清空未读数
            }
            
            const avatar = friendElement.querySelector('.friend-avatar');
            if (avatar) {
                avatar.classList.remove('avatar-flashing');
            }
            
            // 清除消息处理状态，避免重复闪烁
            if (messageProcessingStatus) {
                messageProcessingStatus.delete(friend.qq);
            }
        }
        
        // 调用API打开独立聊天窗口
        window.electronAPI.openChatWindow(friend.qq);
    } catch (error) {
        console.error('打开聊天窗口失败:', error);
        showNotification('打开聊天窗口失败', 'error');
    }
} 