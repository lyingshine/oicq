document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsContainer = document.getElementById('results-container');
    const requestsContainer = document.getElementById('requests-container');
    const closeBtn = document.getElementById('close-btn');
    const tabs = document.querySelectorAll('.add-friend-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const requestNotification = document.getElementById('request-notification');

    let currentUserQq = null;
    let friendRequests = [];

    closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            if (tabId === 'requests') {
                requestNotification.style.display = 'none';
                loadFriendRequests();
            }
        });
    });

    window.electronAPI.onCurrentUserQq(qq => {
        currentUserQq = qq;
        loadFriendRequests();
    });

    async function loadFriendRequests() {
        if (!currentUserQq) return;
        
        requestsContainer.innerHTML = '<div class="no-requests">正在加载好友请求...</div>';
        
        try {
            const response = await window.electronAPI.getFriends(currentUserQq);
            
            if (response.success && response.requests && response.requests.length > 0) {
                friendRequests = response.requests;
                
                if (document.querySelector('.add-friend-tab.active').getAttribute('data-tab') !== 'requests') {
                    requestNotification.style.display = 'block';
                }
                
                renderFriendRequests();
            } else {
                requestsContainer.innerHTML = '<div class="no-requests">暂无好友请求</div>';
                requestNotification.style.display = 'none';
            }
        } catch (error) {
            requestsContainer.innerHTML = '<div class="no-requests">加载好友请求失败</div>';
            console.error('加载好友请求失败:', error);
        }
    }

    function renderFriendRequests() {
        if (friendRequests.length === 0) {
            requestsContainer.innerHTML = '<div class="no-requests">暂无好友请求</div>';
            return;
        }

        requestsContainer.innerHTML = friendRequests.map(request => `
            <div class="friend-request-item" data-qq="${request.qq}">
                <img src="${request.avatar || 'assets/logo.png'}" alt="Avatar" class="request-avatar">
                <div class="request-info">
                    <div class="request-name">${request.nickname}</div>
                    <div class="request-message">${request.signature || '...'}</div>
                </div>
                <div class="request-actions">
                    <button class="accept-btn">接受</button>
                    <button class="reject-btn">拒绝</button>
                </div>
            </div>
        `).join('');

        requestsContainer.querySelectorAll('.accept-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => handleRequest(friendRequests[index].qq, 'accept'));
        });

        requestsContainer.querySelectorAll('.reject-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => handleRequest(friendRequests[index].qq, 'reject'));
        });
    }

    async function handleRequest(requesterQq, action) {
        if (!currentUserQq) return;
        const result = action === 'accept'
            ? await window.electronAPI.acceptFriendRequest(currentUserQq, requesterQq)
            : await window.electronAPI.rejectFriendRequest(currentUserQq, requesterQq);

        if (result.success) {
            loadFriendRequests();
        } else {
            alert(`操作失败: ${result.message}`);
        }
    }

    async function searchUsers() {
        const term = searchInput.value.trim();
        if (!term) {
            resultsContainer.innerHTML = '<div class="no-results">请输入昵称或QQ号码搜索好友</div>';
            return;
        }

        resultsContainer.innerHTML = '<div class="no-results">正在搜索...</div>';

        const result = await window.electronAPI.searchUsers(term, currentUserQq);

        if (result.success && result.users.length > 0) {
            resultsContainer.innerHTML = result.users.map(user => `
                <div class="search-result-item" data-qq="${user.qq}">
                    <img src="${user.avatar || 'assets/logo.png'}" alt="Avatar" class="result-avatar">
                    <div class="result-info">
                        <div class="result-name">${user.nickname}</div>
                        <div class="result-qq">${user.qq}</div>
                    </div>
                    <button class="add-btn">加好友</button>
                </div>
            `).join('');

            resultsContainer.querySelectorAll('.add-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const userQq = e.target.closest('.search-result-item').dataset.qq;
                    const sendResult = await window.electronAPI.sendFriendRequest(currentUserQq, userQq);
                    if (sendResult.success) {
                        e.target.textContent = '已发送';
                        e.target.disabled = true;
                    } else {
                        alert(`发送失败: ${sendResult.message}`);
                    }
                });
            });
        } else if (result.success) {
            resultsContainer.innerHTML = '<div class="no-results">未找到相关用户</div>';
        } else {
            resultsContainer.innerHTML = `<div class="no-results" style="color: red;">${result.message}</div>`;
        }
    }

    searchBtn.addEventListener('click', searchUsers);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchUsers();
    });
}); 