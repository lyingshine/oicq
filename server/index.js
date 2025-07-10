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

// Get friends list
app.get('/api/friends/:qq', async (req, res) => {
    const { qq } = req.params;
    const db = await readDB();
    const user = db.users[qq];

    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const friendsDetails = user.friends.map(friendQq => {
        const friendInfo = db.users[friendQq];
        return friendInfo ? {
            qq: friendQq,
            nickname: friendInfo.nickname,
            avatar: friendInfo.avatar
        } : null;
    }).filter(Boolean);

    const requestsDetails = user.friendRequestsReceived.map(requesterQq => {
        const requesterInfo = db.users[requesterQq];
        return requesterInfo ? {
            qq: requesterQq,
            nickname: requesterInfo.nickname,
            avatar: requesterInfo.avatar
        } : null;
    }).filter(Boolean);

    res.json({ success: true, friends: friendsDetails, requests: requestsDetails });
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
    const db = await readDB();

    const user = db.users[userQq];
    const requester = db.users[requesterQq];

    if (!user || !requester) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Remove from requests
    user.friendRequestsReceived = user.friendRequestsReceived.filter(qq => qq !== requesterQq);
    requester.friendRequestsSent = requester.friendRequestsSent.filter(qq => qq !== userQq);

    // Add to friends (both ways)
    if (!user.friends.includes(requesterQq)) {
        user.friends.push(requesterQq);
    }
    if (!requester.friends.includes(userQq)) {
        requester.friends.push(userQq);
    }

    await writeDB(db);
    
    const newFriendInfo = {
        qq: requesterQq,
        nickname: requester.nickname,
        avatar: requester.avatar
    };

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