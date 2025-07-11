const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());

// Helper function to read the database
const readDB = async () => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        const db = JSON.parse(data);
        // 确保nicknames对象存在
        if (!db.nicknames) {
            db.nicknames = {};
            // 如果没有nicknames对象，则根据现有用户数据重建
            if (db.users) {
                for (const qq in db.users) {
                    const nickname = db.users[qq].nickname;
                    if (nickname) {
                        db.nicknames[nickname] = qq;
                    }
                }
            }
        }
        return db;
    } catch (error) {
        // If the file doesn't exist or is empty, start with a default structure
        return { users: {}, lastQQ: 10000, nicknames: {} };
    }
};

// Helper function to write to the database
const writeDB = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
};

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
        return res.status(400).json({ success: false, message: 'Nickname and password are required.' });
    }
    
    const db = await readDB();
    
    // Check if nickname is already taken
    if (db.nicknames[nickname]) {
        return res.status(409).json({ success: false, message: '该昵称已被使用。' });
    }

    const newQQ = db.lastQQ + 1;

    // Generate a simple avatar
    const firstChar = nickname.charAt(0).toUpperCase();
    const bgColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" fill="${bgColor}"/>
            <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="50" fill="#fff">${firstChar}</text>
        </svg>
    `;
    const avatar = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    db.users[newQQ] = { 
        nickname, 
        password, 
        avatar, 
        signature: '这个人很懒，什么都没留下',
        status: 'online', 
        friends: [],
        friendRequestsSent: [],
        friendRequestsReceived: []
    };
    db.nicknames[nickname] = newQQ;
    db.lastQQ = newQQ;
    
    await writeDB(db);

    res.json({ success: true, qq: newQQ });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const db = await readDB();
    
    let user;
    let qq = username;

    if (db.users[username]) {
        user = db.users[username];
    } else if (db.nicknames[username]) {
        qq = db.nicknames[username];
        user = db.users[qq];
    }

    if (user && user.password === password) {
        console.log('用户登录成功:', qq, user.nickname);
        res.json({ 
            success: true, 
            message: 'Login successful.',
            user: {
                qq: qq,
                nickname: user.nickname,
                signature: user.signature || '这个人很懒，什么都没留下',
                avatar: user.avatar,
                status: user.status || 'online'
            }
        });
    } else {
        res.status(401).json({ success: false, message: '账号或密码错误！' });
    }
});

// 修改 Get friends list API
app.get('/api/friends/:qq', async (req, res) => {
    const { qq } = req.params;
    console.log(`获取好友列表请求: QQ=${qq}`);
    
    try {
        const db = await readDB();
        const user = db.users[qq];

        if (!user) {
            console.error(`用户不存在: QQ=${qq}`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 收集好友信息
        const friendsDetails = user.friends.map(friendQq => {
            const friendInfo = db.users[friendQq];
            if (!friendInfo) {
                console.error(`好友不存在: QQ=${friendQq}`);
                return null;
            }
            return {
                qq: friendQq,
                nickname: friendInfo.nickname,
                avatar: friendInfo.avatar,
                signature: friendInfo.signature || '这个人很懒，什么都没留下',
                status: friendInfo.status || 'online',
                groupId: 0  // 默认组ID
            };
        }).filter(Boolean);

        console.log(`用户 ${qq} 的好友列表: ${friendsDetails.length}个好友`);
        console.log(`好友详情样例:`, friendsDetails.length > 0 ? friendsDetails[0] : '无好友');

        // 收集好友请求信息
        const requestsDetails = (user.friendRequestsReceived || []).map(requesterQq => {
            const requesterInfo = db.users[requesterQq];
            if (!requesterInfo) {
                console.error(`请求者不存在: QQ=${requesterQq}`);
                return null;
            }
            return {
                qq: requesterQq,
                nickname: requesterInfo.nickname,
                avatar: requesterInfo.avatar,
                signature: requesterInfo.signature || '这个人很懒，什么都没留下'
            };
        }).filter(Boolean);

        console.log(`用户 ${qq} 有${requestsDetails.length}个好友请求`);

        res.json({ 
            success: true, 
            friends: friendsDetails, 
            requests: requestsDetails
        });
    } catch (error) {
        console.error('获取好友列表出错:', error);
        res.status(500).json({ success: false, message: '服务器错误', error: error.message });
    }
});

// Search for users
app.post('/api/users/search', async (req, res) => {
    const { term, currentUserQq } = req.body;
    if (!term) {
        return res.status(400).json({ success: false, message: 'Search term is required.' });
    }

    const db = await readDB();
    const results = [];
    for (const qq in db.users) {
        if (qq === currentUserQq) continue;

        const user = db.users[qq];
        if (qq.includes(term) || user.nickname.includes(term)) {
            results.push({
                qq,
                nickname: user.nickname,
                avatar: user.avatar
            });
        }
    }
    res.json({ success: true, users: results });
});

// Send a friend request
app.post('/api/friends/request', async (req, res) => {
    const { senderQq, recipientQq } = req.body;
    const db = await readDB();

    const sender = db.users[senderQq];
    const recipient = db.users[recipientQq];

    if (!sender || !recipient) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (sender.friends.includes(recipientQq)) {
        return res.status(400).json({ success: false, message: 'Already friends.' });
    }
    if (sender.friendRequestsSent.includes(recipientQq)) {
        return res.status(400).json({ success: false, message: 'Friend request already sent.' });
    }

    sender.friendRequestsSent.push(recipientQq);
    recipient.friendRequestsReceived.push(senderQq);

    await writeDB(db);
    res.json({ success: true, message: 'Friend request sent.' });
});

// Accept a friend request
app.post('/api/friends/accept', async (req, res) => {
    const { userQq, requesterQq } = req.body;
    console.log(`接受好友请求 - 用户: ${userQq}, 请求方: ${requesterQq}`);
    
    const db = await readDB();
    console.log(`数据库读取成功，用户QQ: ${userQq}, 请求方QQ: ${requesterQq}`);

    const user = db.users[userQq];
    const requester = db.users[requesterQq];

    if (!user || !requester) {
        console.error('用户或请求方不存在:', { user: !!user, requester: !!requester });
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    console.log('当前好友状态:', {
        用户好友列表: user.friends,
        请求方好友列表: requester.friends,
        用户收到的请求: user.friendRequestsReceived,
        请求方发送的请求: requester.friendRequestsSent
    });

    // 检查是否已经是好友
    if (user.friends.includes(requesterQq) && requester.friends.includes(userQq)) {
        console.log('已经是好友，无需再次添加');
        // 返回完整的好友信息
        const newFriendInfo = {
            qq: requesterQq,
            nickname: requester.nickname,
            avatar: requester.avatar,
            signature: requester.signature || '这个人很懒，什么都没留下',
            status: requester.status || 'online'
        };
        return res.json({ success: true, message: 'Already friends.', newFriend: newFriendInfo });
    }

    // Remove from requests
    user.friendRequestsReceived = user.friendRequestsReceived.filter(qq => qq !== requesterQq);
    requester.friendRequestsSent = requester.friendRequestsSent.filter(qq => qq !== userQq);

    // Add to friends (both ways)
    if (!user.friends.includes(requesterQq)) {
        user.friends.push(requesterQq);
        console.log(`将 ${requesterQq} 添加到 ${userQq} 的好友列表中`);
    }
    if (!requester.friends.includes(userQq)) {
        requester.friends.push(userQq);
        console.log(`将 ${userQq} 添加到 ${requesterQq} 的好友列表中`);
    }

    console.log('更新后的好友状态:', {
        用户好友列表: user.friends,
        请求方好友列表: requester.friends,
        用户收到的请求: user.friendRequestsReceived,
        请求方发送的请求: requester.friendRequestsSent
    });

    // 保存到数据库
    await writeDB(db);
    console.log('数据库更新成功');
    
    // 重新读取数据库确认更改已保存
    const updatedDb = await readDB();
    const updatedUser = updatedDb.users[userQq];
    const updatedRequester = updatedDb.users[requesterQq];
    console.log('确认好友关系已保存:', {
        用户好友列表: updatedUser.friends,
        请求方好友列表: updatedRequester.friends
    });
    
    // 返回完整的好友信息
    const newFriendInfo = {
        qq: requesterQq,
        nickname: requester.nickname,
        avatar: requester.avatar,
        signature: requester.signature || '这个人很懒，什么都没留下',
        status: requester.status || 'online'
    };

    console.log('接受好友请求成功，返回新好友信息:', newFriendInfo);
    res.json({ success: true, message: 'Friend request accepted.', newFriend: newFriendInfo });
});

// Reject a friend request
app.post('/api/friends/reject', async (req, res) => {
    const { userQq, requesterQq } = req.body;
    const db = await readDB();

    const user = db.users[userQq];
    const requester = db.users[requesterQq];

    if (!user || !requester) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Remove from requests
    user.friendRequestsReceived = user.friendRequestsReceived.filter(qq => qq !== requesterQq);
    requester.friendRequestsSent = requester.friendRequestsSent.filter(qq => qq !== userQq);

    await writeDB(db);
    res.json({ success: true, message: 'Friend request rejected.' });
});


// Add a friend (DEPRECATED - now uses request system)
app.post('/api/friends/add', async (req, res) => {
    return res.status(400).json({ success: false, message: 'This endpoint is deprecated. Use /api/friends/request instead.' });
});

// 测试接口：直接添加好友关系
app.post('/api/test/add-friend', async (req, res) => {
    const { userQq, friendQq } = req.body;
    
    if (!userQq || !friendQq) {
        return res.status(400).json({ success: false, message: '缺少用户QQ或好友QQ参数' });
    }
    
    console.log(`测试接口：添加好友关系 - 用户: ${userQq}, 好友: ${friendQq}`);
    
    try {
        const db = await readDB();
        
        // 检查用户和好友是否存在
        if (!db.users[userQq] || !db.users[friendQq]) {
            return res.status(404).json({ success: false, message: '用户或好友不存在' });
        }
        
        // 检查是否已经是好友
        if (db.users[userQq].friends.includes(friendQq) && db.users[friendQq].friends.includes(userQq)) {
            return res.json({ success: true, message: '已经是好友，无需重复添加' });
        }
        
        // 添加好友关系（双向）
        if (!db.users[userQq].friends.includes(friendQq)) {
            db.users[userQq].friends.push(friendQq);
        }
        if (!db.users[friendQq].friends.includes(userQq)) {
            db.users[friendQq].friends.push(userQq);
        }
        
        // 保存到数据库
        await writeDB(db);
        
        console.log('测试接口：好友关系添加成功');
        return res.json({ success: true, message: '好友关系添加成功' });
    } catch (error) {
        console.error('测试接口错误:', error);
        return res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// 测试接口：重置好友关系
app.post('/api/test/reset-friends', async (req, res) => {
    const { userQq } = req.body;
    
    if (!userQq) {
        return res.status(400).json({ success: false, message: '缺少用户QQ参数' });
    }
    
    console.log(`测试接口：重置用户好友关系 - 用户: ${userQq}`);
    
    try {
        const db = await readDB();
        
        // 检查用户是否存在
        if (!db.users[userQq]) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 获取当前好友列表的副本
        const currentFriends = [...db.users[userQq].friends];
        
        // 清空该用户的好友列表
        db.users[userQq].friends = [];
        
        // 从每个好友的列表中也移除该用户
        for (const friendQq of currentFriends) {
            if (db.users[friendQq]) {
                db.users[friendQq].friends = db.users[friendQq].friends.filter(qq => qq !== userQq);
            }
        }
        
        // 保存到数据库
        await writeDB(db);
        
        console.log('测试接口：好友关系重置成功');
        return res.json({ success: true, message: '好友关系重置成功' });
    } catch (error) {
        console.error('测试接口错误:', error);
        return res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// 更新在线状态
app.post('/update-status/:qq', async (req, res) => {
    const qq = req.params.qq;
    const { status } = req.body;
    
    console.log(`收到更新状态请求: QQ=${qq}, 状态=${status}`);
    
    try {
        const db = await readDB();
        const user = db.users[qq];
        
        if (user) {
            console.log(`找到用户: ${user.nickname}, 更新状态为: ${status}`);
            // 更新用户状态
            user.status = status;
            
            // 保存到文件
            await writeDB(db);
            console.log('用户数据已保存到文件');
            
            res.json({ 
                success: true, 
                message: '状态已更新'
            });
        } else {
            console.error(`用户不存在: QQ=${qq}`);
            res.status(404).json({ success: false, message: '用户不存在' });
        }
    } catch (error) {
        console.error('保存用户状态失败:', error);
        res.status(500).json({ success: false, message: '保存用户状态失败', error: error.message });
    }
});

// 更新用户资料
app.post('/update-profile/:qq', async (req, res) => {
    const qq = req.params.qq;
    const { nickname, signature, avatar } = req.body;
    
    console.log(`收到更新用户资料请求: QQ=${qq}`);
    console.log(`更新内容: 昵称=${nickname}, 签名=${signature}, 头像=${avatar ? '有图片' : '无图片'}`);
    
    try {
        const db = await readDB();
        const user = db.users[qq];
        
        if (user) {
            console.log(`找到用户: ${user.nickname}`);
            // 更新用户资料
            if (nickname) user.nickname = nickname;
            if (signature) user.signature = signature;
            if (avatar) user.avatar = avatar;
            
            // 保存到文件
            await writeDB(db);
            console.log('用户数据已保存到文件');
            
            res.json({ 
                success: true, 
                message: '用户资料已更新',
                user: {
                    qq,
                    nickname: user.nickname,
                    signature: user.signature,
                    avatar: user.avatar
                }
            });
        } else {
            console.error(`用户不存在: QQ=${qq}`);
            res.status(404).json({ success: false, message: '用户不存在' });
        }
    } catch (error) {
        console.error('保存用户数据失败:', error);
        res.status(500).json({ success: false, message: '保存用户数据失败', error: error.message });
    }
});

// 为测试工具提供一个简单的HTML页面
app.get('/test', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>好友关系测试工具</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
            }
            .panel {
                flex: 1;
                min-width: 300px;
                background-color: white;
                border-radius: 5px;
                padding: 15px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            h1, h2, h3 {
                margin-top: 0;
                color: #333;
            }
            .form-group {
                margin-bottom: 15px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            input, select, button {
                padding: 8px;
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #ddd;
                border-radius: 3px;
            }
            button {
                background-color: #4CAF50;
                color: white;
                border: none;
                cursor: pointer;
                font-weight: bold;
            }
            button:hover {
                background-color: #45a049;
            }
            .response {
                margin-top: 15px;
                padding: 10px;
                background-color: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 3px;
                white-space: pre-wrap;
                max-height: 200px;
                overflow-y: auto;
                font-family: monospace;
            }
            .error {
                color: #d32f2f;
            }
            .success {
                color: #388e3c;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
            }
            table, th, td {
                border: 1px solid #ddd;
            }
            th, td {
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
            }
            tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            .status-dot {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                margin-right: 5px;
            }
            .online {
                background-color: #4CAF50;
            }
            .offline {
                background-color: #ccc;
            }
        </style>
    </head>
    <body>
        <h1>OICQ 好友关系测试工具</h1>
        
        <div class="container">
            <div class="panel">
                <h2>查询用户信息</h2>
                <div class="form-group">
                    <label for="user-qq">用户QQ:</label>
                    <input type="text" id="user-qq" placeholder="输入QQ号">
                </div>
                <button id="query-user">查询</button>
                <div id="user-response" class="response"></div>
            </div>
            
            <div class="panel">
                <h2>手动添加好友关系</h2>
                <div class="form-group">
                    <label for="user1-qq">用户1 QQ:</label>
                    <input type="text" id="user1-qq" placeholder="输入第一个用户QQ">
                </div>
                <div class="form-group">
                    <label for="user2-qq">用户2 QQ:</label>
                    <input type="text" id="user2-qq" placeholder="输入第二个用户QQ">
                </div>
                <button id="add-friend">添加好友关系</button>
                <div id="add-response" class="response"></div>
            </div>
        </div>
        
        <div class="container">
            <div class="panel">
                <h2>重置用户好友关系</h2>
                <div class="form-group">
                    <label for="reset-qq">用户QQ:</label>
                    <input type="text" id="reset-qq" placeholder="输入要重置的用户QQ">
                </div>
                <button id="reset-friends">重置好友关系</button>
                <div id="reset-response" class="response"></div>
            </div>
            
            <div class="panel">
                <h2>数据库浏览</h2>
                <button id="refresh-db">刷新数据</button>
                <div id="db-response" class="response"></div>
            </div>
        </div>
        
        <div class="container">
            <div class="panel">
                <h2>好友列表浏览</h2>
                <div class="form-group">
                    <label for="friends-qq">用户QQ:</label>
                    <input type="text" id="friends-qq" placeholder="输入用户QQ">
                </div>
                <button id="get-friends">获取好友列表</button>
                <div id="friends-table-container"></div>
                <div id="friends-response" class="response"></div>
            </div>
            
            <div class="panel">
                <h2>好友请求测试</h2>
                <div class="form-group">
                    <label for="sender-qq">发送者QQ:</label>
                    <input type="text" id="sender-qq" placeholder="输入发送者QQ">
                </div>
                <div class="form-group">
                    <label for="recipient-qq">接收者QQ:</label>
                    <input type="text" id="recipient-qq" placeholder="输入接收者QQ">
                </div>
                <button id="send-request">发送好友请求</button>
                <div id="request-response" class="response"></div>
            </div>
        </div>
        
        <script>
            document.getElementById('query-user').addEventListener('click', async () => {
                const qq = document.getElementById('user-qq').value.trim();
                const responseDiv = document.getElementById('user-response');
                
                if (!qq) {
                    responseDiv.innerHTML = '<span class="error">请输入QQ号</span>';
                    return;
                }
                
                try {
                    const response = await fetch(\`/api/user/\${qq}\`);
                    const data = await response.json();
                    responseDiv.innerHTML = JSON.stringify(data, null, 2);
                    responseDiv.className = response.ok ? 'response success' : 'response error';
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                }
            });
            
            document.getElementById('add-friend').addEventListener('click', async () => {
                const user1 = document.getElementById('user1-qq').value.trim();
                const user2 = document.getElementById('user2-qq').value.trim();
                const responseDiv = document.getElementById('add-response');
                
                if (!user1 || !user2) {
                    responseDiv.innerHTML = '<span class="error">请输入两个用户的QQ号</span>';
                    return;
                }
                
                try {
                    const response = await fetch('/api/test/add-friend', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userQq: user1, friendQq: user2 })
                    });
                    const data = await response.json();
                    responseDiv.innerHTML = JSON.stringify(data, null, 2);
                    responseDiv.className = response.ok ? 'response success' : 'response error';
                    
                    if (response.ok && data.success) {
                        // 刷新数据
                        document.getElementById('refresh-db').click();
                    }
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                }
            });
            
            document.getElementById('reset-friends').addEventListener('click', async () => {
                const qq = document.getElementById('reset-qq').value.trim();
                const responseDiv = document.getElementById('reset-response');
                
                if (!qq) {
                    responseDiv.innerHTML = '<span class="error">请输入QQ号</span>';
                    return;
                }
                
                if (!confirm(\`确定要重置用户 \${qq} 的所有好友关系吗？这将删除所有好友连接。\`)) {
                    return;
                }
                
                try {
                    const response = await fetch('/api/test/reset-friends', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userQq: qq })
                    });
                    const data = await response.json();
                    responseDiv.innerHTML = JSON.stringify(data, null, 2);
                    responseDiv.className = response.ok ? 'response success' : 'response error';
                    
                    if (response.ok && data.success) {
                        // 刷新数据
                        document.getElementById('refresh-db').click();
                    }
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                }
            });
            
            document.getElementById('refresh-db').addEventListener('click', async () => {
                const responseDiv = document.getElementById('db-response');
                
                try {
                    const response = await fetch('/api/test/db');
                    const data = await response.json();
                    
                    // 简化数据显示，只显示用户列表和其好友关系
                    const simplifiedData = {
                        users: {}
                    };
                    
                    for (const qq in data.users) {
                        const user = data.users[qq];
                        simplifiedData.users[qq] = {
                            nickname: user.nickname,
                            friends: user.friends || [],
                            friendRequestsSent: user.friendRequestsSent || [],
                            friendRequestsReceived: user.friendRequestsReceived || []
                        };
                    }
                    
                    responseDiv.innerHTML = JSON.stringify(simplifiedData, null, 2);
                    responseDiv.className = 'response success';
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                }
            });
            
            document.getElementById('get-friends').addEventListener('click', async () => {
                const qq = document.getElementById('friends-qq').value.trim();
                const responseDiv = document.getElementById('friends-response');
                const tableContainer = document.getElementById('friends-table-container');
                
                if (!qq) {
                    responseDiv.innerHTML = '<span class="error">请输入QQ号</span>';
                    tableContainer.innerHTML = '';
                    return;
                }
                
                try {
                    const response = await fetch(\`/api/friends/\${qq}\`);
                    const data = await response.json();
                    responseDiv.innerHTML = JSON.stringify(data, null, 2);
                    responseDiv.className = response.ok ? 'response success' : 'response error';
                    
                    if (response.ok && data.success) {
                        // 创建表格显示好友列表
                        let tableHtml = '<h3>好友列表</h3>';
                        
                        if (data.friends && data.friends.length > 0) {
                            tableHtml += \`
                                <table>
                                    <tr>
                                        <th>QQ</th>
                                        <th>昵称</th>
                                        <th>状态</th>
                                        <th>签名</th>
                                    </tr>
                            \`;
                            
                            data.friends.forEach(friend => {
                                const isOnline = friend.status === 'online';
                                tableHtml += \`
                                    <tr>
                                        <td>\${friend.qq}</td>
                                        <td>\${friend.nickname}</td>
                                        <td><span class="status-dot \${isOnline ? 'online' : 'offline'}"></span>\${friend.status || 'offline'}</td>
                                        <td>\${friend.signature}</td>
                                    </tr>
                                \`;
                            });
                            
                            tableHtml += '</table>';
                        } else {
                            tableHtml += '<p>没有好友</p>';
                        }
                        
                        // 添加好友请求表格
                        tableHtml += '<h3>好友请求</h3>';
                        
                        if (data.requests && data.requests.length > 0) {
                            tableHtml += \`
                                <table>
                                    <tr>
                                        <th>QQ</th>
                                        <th>昵称</th>
                                        <th>签名</th>
                                    </tr>
                            \`;
                            
                            data.requests.forEach(request => {
                                tableHtml += \`
                                    <tr>
                                        <td>\${request.qq}</td>
                                        <td>\${request.nickname}</td>
                                        <td>\${request.signature}</td>
                                    </tr>
                                \`;
                            });
                            
                            tableHtml += '</table>';
                        } else {
                            tableHtml += '<p>没有好友请求</p>';
                        }
                        
                        tableContainer.innerHTML = tableHtml;
                    } else {
                        tableContainer.innerHTML = '<p class="error">获取好友列表失败</p>';
                    }
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                    tableContainer.innerHTML = '';
                }
            });
            
            document.getElementById('send-request').addEventListener('click', async () => {
                const senderQq = document.getElementById('sender-qq').value.trim();
                const recipientQq = document.getElementById('recipient-qq').value.trim();
                const responseDiv = document.getElementById('request-response');
                
                if (!senderQq || !recipientQq) {
                    responseDiv.innerHTML = '<span class="error">请输入发送者和接收者QQ</span>';
                    return;
                }
                
                try {
                    const response = await fetch('/api/friends/request', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ senderQq, recipientQq })
                    });
                    const data = await response.json();
                    responseDiv.innerHTML = JSON.stringify(data, null, 2);
                    responseDiv.className = response.ok ? 'response success' : 'response error';
                } catch (error) {
                    responseDiv.innerHTML = \`错误: \${error.message}\`;
                    responseDiv.className = 'response error';
                }
            });
            
            // 初始加载时自动刷新数据库
            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('refresh-db').click();
            });
        </script>
    </body>
    </html>
    `);
});

// 添加测试API用于查询用户信息
app.get('/api/user/:qq', async (req, res) => {
    const { qq } = req.params;
    
    try {
        const db = await readDB();
        const user = db.users[qq];
        
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 返回用户信息，但不包括密码
        const { password, ...userInfo } = user;
        return res.json({ success: true, user: userInfo });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 添加测试API用于获取数据库内容
app.get('/api/test/db', async (req, res) => {
    try {
        const db = await readDB();
        // 移除密码信息
        const safeDb = { ...db };
        safeDb.users = { ...db.users };
        
        Object.keys(safeDb.users).forEach(qq => {
            const { password, ...userInfo } = safeDb.users[qq];
            safeDb.users[qq] = userInfo;
        });
        
        return res.json(safeDb);
    } catch (error) {
        console.error('获取数据库内容错误:', error);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.listen(PORT, async () => {
    console.log(`服务器热重载模式已启动，监听端口 ${PORT}`);
    
    // 执行用户数据迁移，确保所有用户有完整的字段
    try {
        const db = await readDB();
        let needsUpdate = false;
        
        // 检查并更新每个用户
        for (const qq in db.users) {
            const user = db.users[qq];
            if (!user.signature) {
                user.signature = '这个人很懒，什么都没留下';
                needsUpdate = true;
                console.log(`为用户 ${user.nickname} (QQ: ${qq}) 添加默认签名`);
            }
            if (!user.status) {
                user.status = 'online';
                needsUpdate = true;
                console.log(`为用户 ${user.nickname} (QQ: ${qq}) 添加默认状态`);
            }
            if (!user.friends) {
                user.friends = [];
                needsUpdate = true;
                console.log(`为用户 ${user.nickname} (QQ: ${qq}) 初始化好友列表`);
            }
            if (!user.friendRequestsSent) {
                user.friendRequestsSent = [];
                needsUpdate = true;
                console.log(`为用户 ${user.nickname} (QQ: ${qq}) 初始化发送的好友请求`);
            }
            if (!user.friendRequestsReceived) {
                user.friendRequestsReceived = [];
                needsUpdate = true;
                console.log(`为用户 ${user.nickname} (QQ: ${qq}) 初始化接收的好友请求`);
            }
        }
        
        // 如果有更新，保存到文件
        if (needsUpdate) {
            await writeDB(db);
            console.log('完成用户数据迁移');
        }
    } catch (error) {
        console.error('用户数据迁移失败:', error);
    }
});