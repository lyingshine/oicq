const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { WebSocketServer } = require('ws');
const axios = require('axios'); // Added axios for API calls

// 添加 iconv-lite 依赖
const iconv = require('iconv-lite');

// 添加控制台日志过滤功能
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  // 禁用所有控制台输出
  return;
};

console.error = function(...args) {
  // 禁用所有控制台输出
  return;
};

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());

// 设置控制台输出编码
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');

// 更新的编码处理函数
function wrapConsoleOutput() {
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    // 禁用所有标准输出
    process.stdout.write = function(chunk, encoding, callback) {
        // 不输出任何内容
        if (callback) callback();
        return true;
    };

    // 禁用所有错误输出
    process.stderr.write = function(chunk, encoding, callback) {
        // 不输出任何内容
        if (callback) callback();
        return true;
    };

    // 禁用 console.log
    console.log = function() {
        return;
    };

    // 禁用 console.error
    console.error = function() {
        return;
    };
}

// 在 Windows 平台上应用编码处理
if (process.platform === 'win32') {
    wrapConsoleOutput();
}

// asyncHandler to wrap async routes and catch errors
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Centralized error handler middleware
const errorHandler = (err, req, res, next) => {
    // 静默处理错误，不输出到控制台
    res.status(500).json({ success: false, message: '服务器错误', error: err.message });
};

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
        // 确保messages对象存在
        if (!db.messages) {
            db.messages = {};
        }
        return db;
    } catch (error) {
        // If the file doesn't exist or is empty, start with a default structure
        return { users: {}, lastQQ: 10000, nicknames: {}, messages: {} };
    }
};

// Helper function to write to the database
const writeDB = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
};

// Ensure DB exists before starting
(async () => {
    try {
        await fs.access(DB_PATH);
    } catch (error) {
        await writeDB({ users: {}, lastQQ: 10000, nicknames: {}, messages: {} });
    }
})();

// Register endpoint
app.post('/api/register', asyncHandler(async (req, res) => {
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
            <rect x="0" y="0" width="100" height="100" fill="${bgColor}"/>
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
}));

// Login endpoint
app.post('/api/login', asyncHandler(async (req, res) => {
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
}));

// 获取用户信息
app.get('/api/users/:qq', asyncHandler(async (req, res) => {
    const qq = req.params.qq;
    
    const db = await readDB();
    const user = db.users[qq];
    
    if (user) {
        res.json({ 
            success: true, 
            user: {
                qq: qq,
                nickname: user.nickname,
                signature: user.signature || '这个人很懒，什么都没留下',
                avatar: user.avatar,
                status: user.status || 'online'
            }
        });
    } else {
        res.status(404).json({ success: false, message: '用户不存在' });
    }
}));

// 修改 Get friends list API
app.get('/api/friends/:qq', asyncHandler(async (req, res) => {
    const { qq } = req.params;
    console.log(`[SERVER] 获取好友列表请求: QQ=${qq}`);
    
        const db = await readDB();
        const user = db.users[qq];

        if (!user) {
            console.error(`[SERVER] 用户不存在: QQ=${qq}`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 收集好友信息
        const friendsDetails = user.friends.map(friendQq => {
            const friendInfo = db.users[friendQq];
            if (!friendInfo) {
                console.error(`[SERVER] 好友不存在: QQ=${friendQq}`);
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

        console.log(`[SERVER] 用户 ${qq} 的好友列表: ${friendsDetails.length}个好友`);
        console.log(`[SERVER] 好友详情样例:`, friendsDetails.length > 0 ? friendsDetails[0] : '无好友');

        // 收集好友请求信息
        const requestsDetails = (user.friendRequestsReceived || []).map(requesterQq => {
            const requesterInfo = db.users[requesterQq];
            if (!requesterInfo) {
                console.error(`[SERVER] 请求者不存在: QQ=${requesterQq}`);
                return null;
            }
            return {
                qq: requesterQq,
                nickname: requesterInfo.nickname,
                avatar: requesterInfo.avatar,
                signature: requesterInfo.signature || '这个人很懒，什么都没留下'
            };
        }).filter(Boolean);

        console.log(`[SERVER] 用户 ${qq} 有${requestsDetails.length}个好友请求`);

        const responseData = { 
            success: true, 
            friends: friendsDetails, 
            requests: requestsDetails
        };
        console.log('[SERVER] 发送好友列表响应:', JSON.stringify(responseData, null, 2));
        res.json(responseData);
}));

// Search for users
app.post('/api/users/search', asyncHandler(async (req, res) => {
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
}));

// Send a friend request
app.post('/api/friends/request', asyncHandler(async (req, res) => {
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
}));

// Accept a friend request
app.post('/api/friends/accept', asyncHandler(async (req, res) => {
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
    if (!user.friends) user.friends = [];
    if (!requester.friends) requester.friends = [];
    
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
}));

// Reject a friend request
app.post('/api/friends/reject', asyncHandler(async (req, res) => {
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
}));

// 更新用户资料
app.post('/api/update-profile/:qq', asyncHandler(async (req, res) => {
    const qq = req.params.qq;
    const { nickname, signature, avatar } = req.body;
    
        const db = await readDB();
        const user = db.users[qq];
        
        if (user) {
            if (nickname) user.nickname = nickname;
            if (signature) user.signature = signature;
            if (avatar) user.avatar = avatar;
            
            await writeDB(db);
            
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
            res.status(404).json({ success: false, message: '用户不存在' });
    }
}));

// 更新在线状态 (已过时，推荐使用 /api/status/update)
app.post('/api/update-status/:qq', asyncHandler(async (req, res) => {
    const qq = req.params.qq;
    const { status } = req.body;
    
    const db = await readDB();
    const user = db.users[qq];
        
    if (user) {
        user.status = status;
        await writeDB(db);
        
        // 返回完整的用户信息，确保UI可以准确更新
        res.json({ 
            success: true, 
            message: '状态已更新',
            user: {
                qq: qq,
                nickname: user.nickname,
                signature: user.signature || '这个人很懒，什么都没留下',
                avatar: user.avatar,
                status: status
            }
        });
    } else {
        res.status(404).json({ success: false, message: '用户不存在' });
    }
}));

// 更新用户状态
app.post('/api/status/update', asyncHandler(async (req, res) => {
    console.log(`---------- 收到状态更新请求 ----------`);
    console.log(`请求体:`, req.body);
    const { qq, status } = req.body;
    
    if (!qq || !status) {
        console.error(`状态更新失败: 缺少必要参数 - QQ=${qq}, 状态=${status}`);
        return res.status(400).json({ 
            success: false, 
            message: 'QQ号和状态都是必需的'
        });
    }

    // 测试失败场景
    if (status === 'test-fail') {
        console.log(`收到测试失败状态请求: QQ=${qq}`);
        return res.status(400).json({
            success: false,
            message: '测试状态更新失败场景'
        });
    }

    // 验证状态值
    const validStatuses = ['online', 'away', 'busy', 'invisible'];
    if (!validStatuses.includes(status)) {
        console.error(`状态更新失败: 无效的状态值 - ${status}`);
        return res.status(400).json({ 
            success: false, 
            message: '无效的状态值'
        });
    }
    
    try {
        console.log(`从数据库读取用户信息: QQ=${qq}`);
        const db = await readDB();
        
        if (!db.users[qq]) {
            console.error(`状态更新失败: 用户不存在 - QQ=${qq}`);
            return res.status(404).json({ 
                success: false, 
                message: '用户不存在'
            });
        }

        // 获取用户当前状态用于日志
        const oldStatus = db.users[qq].status || 'unknown';
        
        // 更新用户状态
        console.log(`更新状态: QQ=${qq}, 旧状态=${oldStatus}, 新状态=${status}`);
        db.users[qq].status = status;
        
        // 写入数据库
        console.log(`保存状态更新到数据库`);
        await writeDB(db);

        console.log(`用户 ${qq} 状态更新成功: ${oldStatus} -> ${status}`);
        
        // 返回完整的用户信息，确保UI可以准确更新
        const user = db.users[qq];
        console.log(`返回完整用户信息:`, {
            qq,
            nickname: user.nickname,
            signature: user.signature ? (user.signature.length > 20 ? user.signature.substring(0, 20) + '...' : user.signature) : '(无签名)',
            status
        });
        
        const response = { 
            success: true, 
            message: '状态更新成功',
            status: status,
            user: {
                qq: qq,
                nickname: user.nickname,
                signature: user.signature || '这个人很懒，什么都没留下',
                avatar: user.avatar,
                status: status
            }
        };
        
        res.json(response);
        console.log(`---------- 状态更新请求处理完成 ----------`);

        // Notify friends about the status change
        if (user && user.friends) {
            user.friends.forEach(friendQq => {
                const friendSocket = clients.get(friendQq);
                if (friendSocket && friendSocket.readyState === friendSocket.OPEN) {
                    friendSocket.send(JSON.stringify({
                        type: 'friend-status-update',
                        payload: {
                            qq,
                            status
                        }
                    }));
                    console.log(`已通知好友 ${friendQq} 关于 ${qq} 的状态更新`);
                }
            });
        }

    } catch (error) {
        console.error('更新状态时出错:', error);
        res.status(500).json({ 
            success: false, 
            message: '更新状态失败',
            error: error.message
        });
    }
}));

// 为所有用户重新生成头像
app.post('/api/regenerate-avatars', asyncHandler(async (req, res) => {
    const db = await readDB();
    
    // 遍历所有用户并重新生成头像
    for (const qq in db.users) {
        const user = db.users[qq];
        const nickname = user.nickname;
        const firstChar = nickname.charAt(0).toUpperCase();
        const bgColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                <rect x="0" y="0" width="100" height="100" fill="${bgColor}"/>
                <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="50" fill="#fff">${firstChar}</text>
            </svg>
        `;
        const avatar = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        
        // 更新用户的头像
        db.users[qq].avatar = avatar;
    }
    
    await writeDB(db);
    
    res.json({ success: true, message: '所有用户头像已重新生成' });
}));

// 更新用户头像
app.post('/api/update-avatar/:qq', asyncHandler(async (req, res) => {
    const qq = req.params.qq;
    const { avatar } = req.body;
    
    if (!avatar) {
        return res.status(400).json({ success: false, message: '头像数据不能为空' });
    }
    
    const db = await readDB();
    const user = db.users[qq];
    
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 更新用户的头像
    user.avatar = avatar;
    await writeDB(db);
    
    res.json({ 
        success: true, 
        message: '头像已更新',
        user: {
            qq,
            nickname: user.nickname,
            signature: user.signature || '这个人很懒，什么都没留下',
            avatar: user.avatar,
            status: user.status || 'online'
        }
    });
}));

// 存储聊天消息
app.post('/api/messages/send', asyncHandler(async (req, res) => {
    const { senderQq, receiverQq, message } = req.body;
    
    if (!senderQq || !receiverQq || !message) {
        return res.status(400).json({ success: false, message: '发送者、接收者和消息内容都是必需的' });
    }
    
    // 创建消息ID
    const timestamp = Date.now();
    const messageId = `${timestamp}_${Math.random().toString(36).substring(2, 15)}`;
    
    // 先立即通过WebSocket发送消息给接收者，不等待数据库操作
    const receiverSocket = clients.get(receiverQq);
    if (receiverSocket && receiverSocket.readyState === receiverSocket.OPEN) {
        try {
            receiverSocket.send(JSON.stringify({
                type: 'new-message',
                payload: {
                    id: messageId,
                    sender: senderQq,
                    content: message,
                    timestamp
                }
            }));
        } catch (error) {
            // 静默处理WebSocket发送错误
        }
    }
    
    // 同时立即发送消息给发送者，确保双向同步
    const senderSocket = clients.get(senderQq);
    if (senderSocket && senderSocket.readyState === senderSocket.OPEN && senderSocket !== receiverSocket) {
        try {
            senderSocket.send(JSON.stringify({
                type: 'message-sent-confirmation',
                payload: {
                    id: messageId,
                    receiver: receiverQq,
                    content: message,
                    timestamp
                }
            }));
        } catch (error) {
   4
   123
   4
            // 静默处理WebSocket发送错误
        }
    }
    
    // 异步处理数据库存储，不阻塞响应
    (async () => {
        try {
            const db = await readDB();
            
            // 验证发送者和接收者是否存在
            if (!db.users[senderQq] || !db.users[receiverQq]) {
                return; // 静默失败
            }
            
            // 创建消息对象
            const messageObj = {
                id: messageId,
                sender: senderQq,
                receiver: receiverQq,
                content: message,
                timestamp,
                read: false
            };
            
            // 确保消息存储结构存在
            if (!db.messages[senderQq]) {
                db.messages[senderQq] = {};
            }
            if (!db.messages[senderQq][receiverQq]) {
                db.messages[senderQq][receiverQq] = [];
            }
            
            // 存储消息
            db.messages[senderQq][receiverQq].push(messageObj);
            
            // 确保接收者的消息存储结构存在
            if (!db.messages[receiverQq]) {
                db.messages[receiverQq] = {};
            }
            if (!db.messages[receiverQq][senderQq]) {
                db.messages[receiverQq][senderQq] = [];
            }
            
            // 在接收者的消息列表中也存储一份
            db.messages[receiverQq][senderQq].push(messageObj);
            
            await writeDB(db);
        } catch (error) {
            // 静默处理数据库错误
        }
    })();
    
    // 立即返回成功响应
    res.json({ 
        success: true, 
        message: '消息发送成功',
        messageId
    });
}));

// 获取与特定用户的聊天历史
app.get('/api/messages/:userQq/:otherQq', asyncHandler(async (req, res) => {
    try {
        const { userQq, otherQq } = req.params;
        const limit = parseInt(req.query.limit) || 50; // 默认获取最近50条消息
        
        console.log(`获取聊天历史: 用户 ${userQq} 与 ${otherQq} 的对话，限制 ${limit} 条`);
        
        const db = await readDB();
        
        // 验证用户是否存在
        if (!db.users[userQq] || !db.users[otherQq]) {
            console.error(`获取聊天历史失败: 用户不存在 - 用户 ${userQq} 或 ${otherQq}`);
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 获取消息
        let messages = [];
        
        if (db.messages && db.messages[userQq] && db.messages[userQq][otherQq]) {
            // 深拷贝消息，避免修改原始数据
            messages = JSON.parse(JSON.stringify(db.messages[userQq][otherQq]));
            
            // 验证消息格式
            messages = messages.filter(msg => {
                if (!msg || typeof msg !== 'object') {
                    console.error('过滤无效消息:', msg);
                    return false;
                }
                
                // 确保消息有必要的字段
                if (!msg.content) msg.content = '';
                if (!msg.timestamp) msg.timestamp = Date.now();
                if (!msg.sender) msg.sender = userQq; // 默认为当前用户
                
                return true;
            });
        }
        
        console.log(`找到 ${messages.length} 条消息记录`);
        
        // 按时间排序并限制数量
        try {
            messages.sort((a, b) => a.timestamp - b.timestamp);
            messages = messages.slice(-limit);
        } catch (sortError) {
            console.error('排序消息时出错:', sortError);
        }
        
        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('获取聊天历史时出错:', error);
        res.status(500).json({ success: false, message: '服务器错误', error: error.message });
    }
}));

// 标记消息为已读
app.post('/api/messages/read', asyncHandler(async (req, res) => {
    const { userQq, otherQq } = req.body;
    
    if (!userQq || !otherQq) {
        return res.status(400).json({ success: false, message: '用户ID和对方ID都是必需的' });
    }
    
    const db = await readDB();
    
    // 验证用户是否存在
    if (!db.users[userQq] || !db.users[otherQq]) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 标记消息为已读
    if (db.messages[userQq] && db.messages[userQq][otherQq]) {
        db.messages[userQq][otherQq].forEach(msg => {
            if (msg.sender === otherQq) {
                msg.read = true;
            }
        });
        
        await writeDB(db);
    }
    
    res.json({
        success: true,
        message: '消息已标记为已读'
    });
}));

app.use(errorHandler);

const server = app.listen(PORT, () => {
    // 服务器启动，不输出任何日志
});

// 重构WebSocket服务器
const wss = new WebSocketServer({ server });

// 存储客户端连接
const clients = new Map();
// 存储消息队列，用于确保消息可靠传递
const messageQueues = new Map();
// 存储消息确认状态
const messageAcks = new Map();

// 定期清理过期的消息确认
setInterval(() => {
    const now = Date.now();
    for (const [messageId, data] of messageAcks.entries()) {
        if (now - data.timestamp > 60000) { // 1分钟后过期
            messageAcks.delete(messageId);
        }
    }
}, 30000);

// 处理新的WebSocket连接
wss.on('connection', (ws) => {
    let userQq = null;
    
    // 设置心跳检测
    let heartbeatInterval;
    const startHeartbeat = () => {
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                } catch (e) {
                    // 静默处理错误
                }
            }
        }, 15000); // 每15秒发送一次心跳
    };
    
    startHeartbeat();
    
    // 处理消息
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // 处理心跳响应
            if (data.type === 'pong') {
                return;
            }
            
            // 处理消息确认
            if (data.type === 'ack') {
                const { messageId } = data;
                if (messageId && messageAcks.has(messageId)) {
                    messageAcks.delete(messageId);
                }
                return;
            }
            
            // 用户登录
            if (data.type === 'login' && data.qq) {
                userQq = data.qq;
                clients.set(userQq, ws);
                
                // 初始化消息队列
                if (!messageQueues.has(userQq)) {
                    messageQueues.set(userQq, []);
                }
                
                // 发送所有排队的消息
                const queuedMessages = messageQueues.get(userQq) || [];
                while (queuedMessages.length > 0) {
                    const queuedMsg = queuedMessages.shift();
                    try {
                        ws.send(JSON.stringify(queuedMsg));
                    } catch (e) {
                        // 发送失败，重新放回队列
                        queuedMessages.unshift(queuedMsg);
                        break;
                    }
                }
                
                // 通知好友上线
                notifyFriendsStatus(userQq, 'online');
                
                // 发送未读消息通知
                sendUnreadMessagesCount(userQq, ws);
                return;
            }
            
            // 发送消息
            if (data.type === 'send-message') {
                const { sender, receiver, content, clientMessageId } = data;
                if (!sender || !receiver || !content) return;
                
                // 生成服务器端消息ID
                const timestamp = Date.now();
                const serverMessageId = `${timestamp}_${Math.random().toString(36).substring(2, 15)}`;
                
                // 立即确认消息已接收
                sendToClient(ws, {
                    type: 'message-received',
                    payload: {
                        clientMessageId,
                        serverMessageId,
                        timestamp
                    }
                });
                
                // 异步保存消息到数据库
                saveMessageToDb(sender, receiver, content, serverMessageId, timestamp).then(() => {
                    // 发送消息到接收者
                    deliverMessage(sender, receiver, content, serverMessageId, timestamp);
                    
                    // 发送消息确认到发送者
                    sendToClient(ws, {
                        type: 'message-delivered',
                        payload: {
                            clientMessageId,
                            serverMessageId,
                            receiver,
                            timestamp
                        }
                    });
                }).catch(() => {
                    // 发送存储失败通知
                    sendToClient(ws, {
                        type: 'message-store-failed',
                        payload: {
                            clientMessageId,
                            serverMessageId
                        }
                    });
                });
                
                return;
            }
            
            // 消息已读通知
            if (data.type === 'mark-read') {
                const { userQq, otherQq } = data;
                if (userQq && otherQq) {
                    markMessagesAsRead(userQq, otherQq);
                }
                return;
            }
            
            // 状态更新
            if (data.type === 'status-update') {
                const { qq, status } = data;
                if (qq && status) {
                    updateUserStatus(qq, status);
                    notifyFriendsStatus(qq, status);
                }
                return;
            }
            
            // 处理心跳消息
            if (data.type === 'ping') {
                try {
                    ws.send(JSON.stringify({ type: 'pong' }));
                } catch (error) {
                    // 静默处理错误
                }
                return;
            }
            
        } catch (error) {
            // 静默处理解析错误
        }
    });
    
    // 处理连接关闭
    ws.on('close', () => {
        if (userQq) {
            clients.delete(userQq);
            clearInterval(heartbeatInterval);
            
            // 更新用户状态为离线
            updateUserStatus(userQq, 'offline');
            notifyFriendsStatus(userQq, 'offline');
        }
    });
    
    // 处理错误
    ws.on('error', () => {
        // 静默处理错误
    });
});

// 发送消息到客户端，带重试机制
function sendToClient(ws, message, maxRetries = 3) {
    if (!ws || ws.readyState !== ws.OPEN) return false;
    
    try {
        ws.send(JSON.stringify(message));
        return true;
    } catch (error) {
        if (maxRetries > 0) {
            setTimeout(() => {
                sendToClient(ws, message, maxRetries - 1);
            }, 100);
        }
        return false;
    }
}

// 将消息投递到接收者
function deliverMessage(sender, receiver, content, messageId, timestamp) {
    const receiverWs = clients.get(receiver);
    
    // 创建消息对象
    const messageObj = {
        type: 'new-message',
        payload: {
            id: messageId,
            sender,
            content,
            timestamp
        }
    };
    
    // 如果接收者在线，直接发送
    if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
        const sent = sendToClient(receiverWs, messageObj);
        if (!sent) {
            // 发送失败，加入队列
            const queue = messageQueues.get(receiver) || [];
            queue.push(messageObj);
            messageQueues.set(receiver, queue);
        }
    } else {
        // 接收者不在线，加入队列
        const queue = messageQueues.get(receiver) || [];
        queue.push(messageObj);
        messageQueues.set(receiver, queue);
    }
}

// 异步保存消息到数据库
async function saveMessageToDb(sender, receiver, content, messageId, timestamp) {
    try {
        const db = await readDB();
        
        // 验证发送者和接收者是否存在
        if (!db.users[sender] || !db.users[receiver]) {
            throw new Error('用户不存在');
        }
        
        // 创建消息对象
        const messageObj = {
            id: messageId,
            sender,
            receiver,
            content,
            timestamp,
            read: false
        };
        
        // 确保消息存储结构存在
        if (!db.messages[sender]) {
            db.messages[sender] = {};
        }
        if (!db.messages[sender][receiver]) {
            db.messages[sender][receiver] = [];
        }
        
        // 存储消息
        db.messages[sender][receiver].push(messageObj);
        
        // 确保接收者的消息存储结构存在
        if (!db.messages[receiver]) {
            db.messages[receiver] = {};
        }
        if (!db.messages[receiver][sender]) {
            db.messages[receiver][sender] = [];
        }
        
        // 在接收者的消息列表中也存储一份
        db.messages[receiver][sender].push(messageObj);
        
        await writeDB(db);
        return true;
    } catch (error) {
        return false;
    }
}

// 标记消息为已读
async function markMessagesAsRead(userQq, otherQq) {
    try {
        const db = await readDB();
        
        // 验证用户是否存在
        if (!db.users[userQq] || !db.users[otherQq]) {
            return false;
        }
        
        // 标记消息为已读
        if (db.messages[userQq] && db.messages[userQq][otherQq]) {
            let hasUnread = false;
            db.messages[userQq][otherQq].forEach(msg => {
                if (msg.sender === otherQq && !msg.read) {
                    msg.read = true;
                    hasUnread = true;
                }
            });
            
            if (hasUnread) {
                await writeDB(db);
                
                // 通知客户端更新未读消息计数
                const userWs = clients.get(userQq);
                if (userWs && userWs.readyState === userWs.OPEN) {
                    sendUnreadMessagesCount(userQq, userWs);
                }
            }
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// 发送未读消息计数
async function sendUnreadMessagesCount(userQq, ws) {
    try {
        const db = await readDB();
        
        if (db.messages && db.messages[userQq]) {
            const unreadMessages = {};
            
            // 遍历所有与该用户有聊天记录的好友
            for (const friendQq in db.messages[userQq]) {
                // 过滤出未读消息
                const unread = db.messages[userQq][friendQq].filter(
                    msg => msg.sender === friendQq && !msg.read
                );
                
                if (unread.length > 0) {
                    unreadMessages[friendQq] = unread.length;
                }
            }
            
            // 如果有未读消息，发送通知
            if (Object.keys(unreadMessages).length > 0) {
                sendToClient(ws, {
                    type: 'unread-messages',
                    payload: unreadMessages
                });
            }
        }
    } catch (error) {
        // 静默处理错误
    }
}

// 通知好友状态变化
async function notifyFriendsStatus(userQq, status) {
    try {
        const db = await readDB();
        const user = db.users[userQq];
        
        if (user && user.friends) {
            user.friends.forEach(friendQq => {
                const friendWs = clients.get(friendQq);
                if (friendWs && friendWs.readyState === friendWs.OPEN) {
                    sendToClient(friendWs, {
                        type: 'friend-status-update',
                        payload: { qq: userQq, status }
                    });
                }
            });
        }
    } catch (error) {
        // 静默处理错误
    }
}

// 更新用户状态
async function updateUserStatus(userQq, status) {
    try {
        const db = await readDB();
        const user = db.users[userQq];
        
        if (user) {
            user.status = status;
            await writeDB(db);
        }
    } catch (error) {
        // 静默处理错误
    }
}