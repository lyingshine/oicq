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

// 添加一个标志，表示是否正在进行状态更新操作
let isStatusUpdateInProgress = false;

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
    
    if (isStatusUpdate) {
        console.log(`检测到状态更新: ${previousUser.status} -> ${user.status}`);
        
        // 如果当前正在进行状态更新操作，且服务器返回的状态与用户选择的状态不一致，可能是由于竞态条件
        if (isStatusUpdateInProgress) {
            console.log('检测到状态更新操作正在进行中，跳过服务器自动更新');
            console.log('当前正在处理的状态更新:', previousUser.status, ' -> ', user.status);
            return;
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
    console.log(`---------- 状态更新流程开始 ----------`);
    console.log(`请求更新状态为: ${status}`);
    
    if (!window.currentUser) {
        console.error('未找到当前用户信息，无法更新状态');
        alert('状态更新失败: 未找到当前用户信息');
        return;
    }

    // 如果已经是目标状态，直接返回
    if (window.currentUser.status === status) {
        console.log(`当前状态已经是 ${status}，不需要更新`);
        console.log(`---------- 状态更新流程结束（无需更新）----------`);
        return;
    }

    // 保存原始状态，以便在服务器返回失败时恢复
    const originalStatus = window.currentUser.status;
    console.log(`保存原始状态: ${originalStatus}`);
    
    // 设置状态更新进行中标志
    console.log(`设置状态更新进行中标志`);
    isStatusUpdateInProgress = true;
    
    // 记录开始时间，用于计算操作耗时
    const startTime = Date.now();
    
    try {
        // 先乐观地更新UI
        console.log(`[UI] 乐观更新UI为新状态: ${status}`);
        const tempUser = { ...window.currentUser, status: status };
        
        // 立即更新UI，而不等待服务器响应
        applyUserInfoToUI(tempUser);

        // 添加测试失败功能 - 当状态为"test-fail"时模拟失败
        if (status === 'test-fail') {
            console.log('检测到测试失败状态，准备处理测试失败场景');
        }
        
        // 发送请求到服务器
        console.log(`[网络] 发送状态更新请求到服务器: QQ=${window.currentUser.qq}, 状态=${status}`);
        const response = await window.electronAPI.updateStatus(window.currentUser.qq, status);
        console.log(`[网络] 收到服务器响应:`, response);
        
        // 明确检查响应中的success字段
        if (!response || response.success === false) {
            const errorMsg = response?.message || '状态更新失败，未知原因';
            console.error(`[错误] 服务器返回失败: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        // 服务器请求成功后，更新window.currentUser和本地存储
        console.log(`[成功] 状态更新请求成功，更新本地数据`);
        
        // 更新currentUser对象
        window.currentUser.status = status;
        console.log(`[数据] 更新全局状态为: ${status}`);
        
        // 如果响应中包含user数据，使用它进行完整更新
        if (response.user) {
            console.log(`[数据] 使用服务器返回的完整用户数据更新`);
            window.currentUser = response.user;
            
            // 再次确保状态字段是正确的
            if (window.currentUser.status !== status) {
                console.warn(`[警告] 服务器返回的状态(${window.currentUser.status})与请求的状态(${status})不一致，强制修正`);
                window.currentUser.status = status;
            }
        }
        
        // 保存到本地存储
        localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
        console.log(`[数据] 用户数据已更新到本地存储`);
        
        // 再次强制更新UI，确保显示正确
        console.log(`[UI] 再次更新UI以确保状态显示正确`);
        applyUserInfoToUI(window.currentUser);
        
        // 通知用户状态更新成功
        const elapsedTime = Date.now() - startTime;
        console.log(`[成功] 状态更新完成，耗时: ${elapsedTime}ms`);
        showNotification(`状态已更新为${getStatusText(status)}`, 'success');

    } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.error(`[错误] 状态更新失败，耗时: ${elapsedTime}ms，错误: ${error.message}`);
        
        // 恢复原始状态的UI
        console.log(`[恢复] 开始恢复UI到原始状态: ${originalStatus}`);
        window.currentUser.status = originalStatus;
        
        console.log(`[恢复] 恢复中 - 当前全局状态: ${window.currentUser.status}`);
        console.log(`[恢复] 恢复中 - 开始重新应用UI`);
        
        applyUserInfoToUI(window.currentUser);
        console.log(`[恢复] 恢复UI完成`);
        
        // 使用更明显的方式显示错误
        const errorMessage = error.message || '状态更新失败';
        console.error(`[UI] 显示错误提示: ${errorMessage}`);
        
        // 显示错误通知
        showNotification(`状态更新失败: ${errorMessage}`, 'error');
        
        // 同时保留alert作为备选
        alert('状态更新失败: ' + errorMessage);
    } finally {
        // 清除状态更新进行中标志
        isStatusUpdateInProgress = false;
        console.log(`[清理] 已清除状态更新进行中标志`);
        console.log(`---------- 状态更新流程结束 ----------`);
    }
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
    if (!user) {
        console.error('[UI错误] 无法更新UI: 用户对象为空');
        return;
    }
    
    console.log(`[UI] 开始更新UI: 用户=${user.qq}, 状态=${user.status}`);
    console.log(`[UI] 当前DOM状态: 正在检查...`);
    
    // 检查当前DOM状态
    const statusIconEl = document.getElementById('avatar-status-icon');
    const currentUIStatus = statusIconEl ? statusIconEl.classList.contains(user.status) : 'unknown';
    console.log(`[UI] 当前DOM状态图标类: ${statusIconEl ? statusIconEl.className : 'not found'}`);
    console.log(`[UI] DOM是否已经包含正确的状态类? ${currentUIStatus ? 'Yes' : 'No'}`);

    // 强制执行UI更新
    // 延迟很短的时间后执行，确保DOM有机会更新
    setTimeout(() => {
        try {
            // 更新昵称
            const nicknameEl = document.getElementById('nickname');
            if (nicknameEl) {
                nicknameEl.textContent = user.nickname || `用户${user.qq}`;
                console.log(`[UI] 昵称已更新: ${nicknameEl.textContent}`);
            } else {
                console.error('[UI错误] 找不到昵称元素');
            }

            // 更新个性签名
            const signatureEl = document.getElementById('signature-text');
            if (signatureEl) {
                signatureEl.textContent = user.signature || '这个人很懒，什么都没留下';
                console.log(`[UI] 签名已更新: ${signatureEl.textContent.substring(0, 20)}${signatureEl.textContent.length > 20 ? '...' : ''}`);
            } else {
                console.error('[UI错误] 找不到签名元素');
            }

            // 更新头像
            const avatarEl = document.getElementById('main-avatar-img');
            if (avatarEl) {
                if (user.avatar) {
                    avatarEl.src = user.avatar;
                    avatarEl.onerror = () => {
                        console.warn('[UI警告] 头像加载失败，使用默认头像');
                        avatarEl.src = 'assets/logo.png';
                    };
                    console.log(`[UI] 头像已更新: ${user.avatar.substring(0, 30)}...`);
                } else {
                    avatarEl.src = 'assets/logo.png';
                    console.log(`[UI] 已设置默认头像`);
                }
            } else {
                console.error('[UI错误] 找不到头像元素');
            }

            // 更新在线状态 - 文本
            const statusTextEl = document.querySelector('.status-text');
            if (statusTextEl) {
                const statusText = `[${getStatusText(user.status || 'online')}]`;
                
                // 尝试多种方式更新文本，确保更新成功
                try {
                    statusTextEl.textContent = statusText;
                    statusTextEl.innerHTML = statusText;
                    // 强制重绘
                    statusTextEl.style.display = 'none';
                    statusTextEl.offsetHeight; // 触发回流
                    statusTextEl.style.display = '';
                    
                    console.log(`[UI] 状态文本已更新为: ${statusText}`);
                } catch (e) {
                    console.error('[UI错误] 更新状态文本失败:', e);
                }
            } else {
                console.error('[UI错误] 找不到状态文本元素');
            }

            // 更新头像上的状态指示器
            const avatarStatusIconEl = document.getElementById('avatar-status-icon');
            if (avatarStatusIconEl) {
                // 记录原始类名
                const originalClassName = avatarStatusIconEl.className;
                console.log(`[UI] 状态图标原始类名: ${originalClassName}`);
                
                // 先清除所有状态相关的类
                avatarStatusIconEl.classList.remove('online', 'away', 'busy', 'invisible', 'test-fail');
                
                // 设置新的类名
                const newStatus = user.status || 'online';
                const newClassName = `status-icon ${newStatus}`;
                
                // 多种方式设置类名，确保更新成功
                avatarStatusIconEl.className = newClassName;
                avatarStatusIconEl.setAttribute('class', newClassName);
                
                // 添加自定义属性记录状态
                avatarStatusIconEl.setAttribute('data-status', newStatus);
                
                // 为确保类被正确应用，直接设置对应的背景颜色
                const statusColors = {
                    'online': '#44b549',
                    'away': '#ffc107',
                    'busy': '#f44336',
                    'invisible': '#9e9e9e',
                    'test-fail': '#ff4444'
                };
                
                if (statusColors[newStatus]) {
                    avatarStatusIconEl.style.backgroundColor = statusColors[newStatus];
                }
                
                console.log(`[UI] 状态图标已更新: ${originalClassName} -> ${newClassName}`);
                console.log(`[UI] 状态图标背景色已设置为: ${statusColors[newStatus] || '未知'}`);
                
                // 验证类名是否成功应用
                setTimeout(() => {
                    console.log(`[UI] 验证状态图标类名: ${avatarStatusIconEl.className}`);
                    console.log(`[UI] 验证状态属性: ${avatarStatusIconEl.getAttribute('data-status')}`);
                    
                    if (!avatarStatusIconEl.classList.contains(newStatus)) {
                        console.warn(`[UI警告] 状态类名可能未正确应用，尝试强制设置`);
                        // 再次尝试设置类名
                        avatarStatusIconEl.className = newClassName;
                        // 强制重绘
                        avatarStatusIconEl.style.display = 'none';
                        avatarStatusIconEl.offsetHeight; // 触发回流
                        avatarStatusIconEl.style.display = '';
                    }
                }, 5);
            } else {
                console.error('[UI错误] 找不到状态图标元素');
            }
            
            console.log(`[UI] UI更新完成，用户状态: ${user.status}`);
        } catch (e) {
            console.error('[UI错误] UI更新过程中出错:', e);
        }
    }, 10);
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