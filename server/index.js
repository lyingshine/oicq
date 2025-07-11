const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

// 添加 iconv-lite 依赖
const iconv = require('iconv-lite');

// 添加控制台日志过滤功能
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  // 只允许输出包含状态切换相关关键词的日志
  const logString = args.join(' ').toLowerCase();
  
  // 是否应该显示此日志
  const shouldLog = (
    // 新的日志格式，带有分隔线和标签的日志
    logString.includes('----------') ||
    logString.includes('状态更新请求') ||
    logString.includes('请求体') ||
    logString.includes('从数据库读取') ||
    logString.includes('更新状态:') ||
    logString.includes('状态更新成功') ||
    logString.includes('返回完整用户信息') ||
    
    // 原有的状态相关关键词
    logString.includes('状态更新') || 
    logString.includes('状态=') || 
    logString.includes('status=') || 
    logString.includes('状态：') ||
    logString.includes('status：')
  );
  
  // 如果应该显示，则调用原始的console.log
  if (shouldLog) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = function(...args) {
  // 保留所有状态更新相关的错误
  const logString = args.join(' ').toLowerCase();
  
  // 是否应该显示此错误
  const shouldLog = (
    // 特定的错误类型
    logString.includes('状态更新失败') ||
    logString.includes('无效的状态值') ||
    logString.includes('用户不存在') ||
    logString.includes('更新状态时出错') ||
    
    // 原有的状态相关关键词
    logString.includes('状态更新') || 
    logString.includes('状态=') || 
    logString.includes('status')
  );
  
  // 如果应该显示，则调用原始的console.error
  if (shouldLog) {
    originalConsoleError.apply(console, args);
  }
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

    process.stdout.write = function(chunk, encoding, callback) {
        if (typeof chunk === 'string') {
            chunk = iconv.encode(iconv.decode(Buffer.from(chunk, 'utf8'), 'utf8'), 'gbk');
        }
        return originalStdoutWrite.call(this, chunk, encoding, callback);
    };

    process.stderr.write = function(chunk, encoding, callback) {
        if (typeof chunk === 'string') {
            chunk = iconv.encode(iconv.decode(Buffer.from(chunk, 'utf8'), 'utf8'), 'gbk');
        }
        return originalStderrWrite.call(this, chunk, encoding, callback);
    };

    // 重写 console.log 和 console.error
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = function(...args) {
        const output = args.map(arg => 
            typeof arg === 'string' ? arg : JSON.stringify(arg)
        ).join(' ');
        originalStdoutWrite.call(process.stdout, output + '\n');
    };

    console.error = function(...args) {
        const output = args.map(arg => 
            typeof arg === 'string' ? arg : JSON.stringify(arg)
        ).join(' ');
        originalStderrWrite.call(process.stderr, output + '\n');
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
    console.error('错误:', err);
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
    console.log(`获取好友列表请求: QQ=${qq}`);
    
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
    } catch (error) {
        console.error('更新状态时出错:', error);
        res.status(500).json({ 
            success: false, 
            message: '更新状态失败',
            error: error.message
        });
    }
}));

app.use(errorHandler);

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