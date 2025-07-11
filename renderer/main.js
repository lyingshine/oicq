document.addEventListener('DOMContentLoaded', () => {
    // 全局用户变量
    window.currentUser = null;

    // DOM 元素获取
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const mainMenuPopup = document.getElementById('main-menu-popup');
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const addFriendBtn = document.getElementById('add-friend-btn');
    const refreshFriendsBtn = document.getElementById('refresh-friends-btn');
    const avatarStatusIcon = document.getElementById('avatar-status-icon');
    const statusMenuPopup = document.getElementById('status-menu-popup');
    const testStatusBtn = document.getElementById('test-status-btn');

    // 初始化用户信息显示
    initializeUserInfo();

    // 窗口控制
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    // 主菜单
    mainMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mainMenuPopup.style.display = mainMenuPopup.style.display === 'block' ? 'none' : 'block';
    });

    // 切换账号
    switchAccountBtn.addEventListener('click', async () => {
        await window.electronAPI.switchAccount();
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
            toggleStatusMenu(e);
        });
    }

    if (statusMenuPopup) {
        console.log('添加状态菜单点击事件');
        statusMenuPopup.addEventListener('click', (e) => {
            console.log('状态菜单被点击', e.target);
            const statusItem = e.target.closest('li');
            if (statusItem) {
                const status = statusItem.dataset.status;
                console.log('选择状态:', status);
                updateStatus(status);
                statusMenuPopup.style.display = 'none';
            }
        });
    }

    // 测试状态更新
    if (testStatusBtn) {
        console.log('添加测试状态按钮点击事件');
        testStatusBtn.addEventListener('click', () => {
            console.log('测试状态按钮被点击');
            const statuses = ['online', 'away', 'busy', 'invisible'];
            const currentStatus = window.currentUser?.status || 'online';
            const currentIndex = statuses.indexOf(currentStatus);
            const nextIndex = (currentIndex + 1) % statuses.length;
            const nextStatus = statuses[nextIndex];
            console.log(`测试状态更新: ${currentStatus} -> ${nextStatus}`);
            updateStatus(nextStatus);
        });
    }

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!mainMenuPopup.contains(e.target) && e.target.id !== 'main-menu-btn') {
            mainMenuPopup.style.display = 'none';
        }
        if (!statusMenuPopup.contains(e.target) && e.target.id !== 'avatar-status-icon') {
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

// IPC 事件监听
window.electronAPI.onUserInfo((user) => {
    if (!user) {
        console.error('收到的用户信息无效');
        return;
    }

    console.log('收到用户信息:', user);
    window.currentUser = user;
    
    // 保存到本地存储
    try {
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (error) {
        console.error('保存用户信息到本地存储失败:', error);
    }

    // 更新UI
    applyUserInfoToUI(user);
    getAndRenderFriendList(user.qq);
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

// 函数定义
// 状态菜单相关函数
function toggleStatusMenu(event) {
    console.log('toggleStatusMenu被调用');
    const statusMenuPopup = document.getElementById('status-menu-popup');
    if (!statusMenuPopup) {
        console.error('找不到状态菜单元素');
        return;
    }

    const rect = event.target.getBoundingClientRect();
    console.log('状态图标位置:', rect);
    statusMenuPopup.style.top = `${rect.bottom + 5}px`;
    statusMenuPopup.style.left = `${rect.left}px`;
    statusMenuPopup.style.display = statusMenuPopup.style.display === 'block' ? 'none' : 'block';
    console.log('状态菜单显示状态:', statusMenuPopup.style.display);
}

async function updateStatus(status) {
    console.log('updateStatus被调用, 状态:', status);
    if (!window.currentUser) {
        console.error('未找到当前用户信息');
        alert('状态更新失败: 未找到当前用户信息');
        return;
    }

    try {
        console.log('发送状态更新请求, QQ:', window.currentUser.qq, '状态:', status);
        const response = await window.electronAPI.updateStatus(window.currentUser.qq, status);
        console.log('状态更新响应:', response);
        
        if (!response.success) {
            throw new Error(response.message || '状态更新失败');
        }

        // 不在这里更新UI，而是依赖主进程发送的user-info事件来更新UI
        // 主进程会在收到服务器响应后发送最新的用户信息
        console.log('状态更新请求成功，等待主进程发送更新后的用户信息');

        // 如果响应中包含user数据，可以手动触发更新
        if (response.user) {
            window.currentUser = response.user;
            applyUserInfoToUI(response.user);
            localStorage.setItem('currentUser', JSON.stringify(response.user));
            console.log('使用响应中的用户数据更新UI');
        }

    } catch (error) {
        console.error('更新状态失败:', error);
        alert('状态更新失败: ' + error.message);
    }
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'online': '在线',
        'away': '离开',
        'busy': '忙碌',
        'invisible': '隐身'
    };
    return statusMap[status] || '在线';
}

// 更新用户信息到UI
function applyUserInfoToUI(user) {
    if (!user) return;

    // 更新昵称
    const nicknameEl = document.getElementById('nickname');
    if (nicknameEl) {
        nicknameEl.textContent = user.nickname || `用户${user.qq}`;
    }

    // 更新个性签名
    const signatureEl = document.getElementById('signature-text');
    if (signatureEl) {
        signatureEl.textContent = user.signature || '这个人很懒，什么都没留下';
    }

    // 更新头像
    const avatarEl = document.getElementById('main-avatar-img');
    if (avatarEl) {
        if (user.avatar) {
            avatarEl.src = user.avatar;
            avatarEl.onerror = () => {
                avatarEl.src = 'assets/logo.png';
            };
        } else {
            avatarEl.src = 'assets/logo.png';
        }
    }

    // 更新在线状态
    const statusTextEl = document.querySelector('.status-text');
    if (statusTextEl) {
        statusTextEl.textContent = `[${getStatusText(user.status || 'online')}]`;
    }

    // 更新头像上的状态指示器
    const avatarStatusIconEl = document.getElementById('avatar-status-icon');
    if (avatarStatusIconEl) {
        avatarStatusIconEl.className = `status-icon ${user.status || 'online'}`;
    }
}

async function getAndRenderFriendList(qq) {
    try {
        console.log('开始获取好友列表, QQ:', qq);
        const response = await window.electronAPI.getFriends(qq);
        console.log('获取好友列表响应:', response);

        if (!response) {
            throw new Error('获取好友列表失败：没有响应');
        }

        if (!response.success) {
            throw new Error(response.message || '获取好友列表失败');
        }

        const friendGroups = buildFriendGroups(response.friends, response.requests);
        renderFriendList(friendGroups);
    } catch (error) {
        console.error('获取好友列表失败:', error);
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
    console.log('构建好友分组, 好友数:', friends.length, '请求数:', requests.length);
    
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

    // 只返回有好友的分组
    return groups.filter(g => g.friends.length > 0);
}

function renderFriendList(groups) {
    console.log('渲染好友列表, 分组数:', groups.length);
    
    const friendListEl = document.querySelector('.friend-list');
    if (!friendListEl) {
        console.error('找不到好友列表容器元素');
        return;
    }

    friendListEl.innerHTML = '';

    if (groups.length === 0) {
        friendListEl.innerHTML = `
            <div class="empty-message" style="padding: 20px; text-align: center; color: #666;">
                <i class="fas fa-user-friends" style="font-size: 24px; margin-bottom: 10px;"></i>
                <div>暂无好友</div>
            </div>
        `;
        return;
    }

    groups.forEach(group => {
        const onlineCount = group.friends.filter(f => !f.isRequest && f.status === 'online').length;
        const totalCount = group.friends.filter(f => !f.isRequest).length;

        const groupEl = document.createElement('div');
        groupEl.className = 'friend-group';
        
        // 分组头部
        const headerHtml = `
            <div class="friend-group-header" style="display: flex; align-items: center; padding: 8px; cursor: pointer; background: #f5f5f5; border-bottom: 1px solid #eee;">
                <i class="fas fa-chevron-${group.open ? 'down' : 'right'}" style="margin-right: 5px;"></i>
                <span style="flex: 1;">${group.name}</span>
                ${!group.isRequest ? `<span class="friend-count" style="color: #666; font-size: 12px;">${onlineCount}/${totalCount}</span>` : ''}
            </div>
        `;

        // 好友列表内容
        const contentHtml = `
            <div class="friend-group-content" style="display: ${group.open ? 'block' : 'none'};">
                ${group.friends.map(friend => `
                    <div class="friend-item" style="display: flex; padding: 8px; align-items: center; border-bottom: 1px solid #eee; ${!friend.isRequest && friend.status !== 'online' ? 'opacity: 0.6;' : ''}">
                        <img src="${friend.avatar || 'assets/logo.png'}" alt="头像" 
                             style="width: 40px; height: 40px; border-radius: 3px; margin-right: 10px;"
                             onerror="this.src='assets/logo.png'">
                        <div style="flex: 1; min-width: 0;">
                            <div class="friend-name" style="font-size: 14px; margin-bottom: 2px;">${friend.nickname}</div>
                            <div class="friend-signature" style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${friend.signature || '这个人很懒，什么都没留下'}
                            </div>
                        </div>
                        ${friend.isRequest ? `
                            <div class="friend-request-actions" style="display: flex; gap: 5px;">
                                <button onclick="acceptRequest('${friend.qq}')" 
                                        style="padding: 4px 8px; background: #44b549; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                    接受
                                </button>
                                <button onclick="rejectRequest('${friend.qq}')"
                                        style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                    拒绝
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        groupEl.innerHTML = headerHtml + contentHtml;

        // 添加分组展开/折叠事件
        const header = groupEl.querySelector('.friend-group-header');
        const content = groupEl.querySelector('.friend-group-content');
        const arrow = groupEl.querySelector('.fa-chevron-right, .fa-chevron-down');
        
        header.addEventListener('click', () => {
            const isOpen = content.style.display === 'block';
            content.style.display = isOpen ? 'none' : 'block';
            arrow.className = `fas fa-chevron-${isOpen ? 'right' : 'down'}`;
        });

        friendListEl.appendChild(groupEl);
    });
}

// 处理好友请求
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

function showProfileCard() {
    const user = window.currentUser;
    if (!user) {
        alert('用户信息尚未加载');
        return;
    }
    document.getElementById('nickname-input').value = user.nickname;
    document.getElementById('signature-input').value = user.signature;
    document.getElementById('profile-card').style.display = 'block';
}

async function handleProfileSave() {
    const user = window.currentUser;
    if (!user) return;

    const nickname = document.getElementById('nickname-input').value;
    const signature = document.getElementById('signature-input').value;
    
    const result = await window.electronAPI.updateUserProfile(user.qq, nickname, signature, user.avatar);
    
    if (result.success) {
        window.currentUser = result.data.user;
        localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
        applyUserInfoToUI(window.currentUser);
        document.getElementById('profile-card').style.display = 'none';
    } else {
        alert('更新失败: ' + result.error);
    }
} 