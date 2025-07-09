const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());

// Helper function to read the database
const readDB = () => {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If the file doesn't exist or is empty, start with a default structure
        return { users: {}, lastQQ: 10000 };
    }
};

// Helper function to write to the database
const writeDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// Register endpoint
app.post('/api/register', (req, res) => {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
        return res.status(400).json({ success: false, message: 'Nickname and password are required.' });
    }
    
    const db = readDB();
    
    // Check if nickname is already taken
    if (Object.values(db.users).some(u => u.nickname === nickname)) {
        return res.status(409).json({ success: false, message: '该昵称已被使用。' });
    }

    const newQQ = db.lastQQ + 1;
    db.users[newQQ] = { nickname, password };
    db.lastQQ = newQQ;
    
    writeDB(db);

    res.json({ success: true, qq: newQQ });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const db = readDB();
    const user = db.users[username];

    // Simulate network latency with a 1.5-second delay
    setTimeout(() => {
        if (user && user.password === password) {
            res.json({ success: true, message: 'Login successful.' });
        } else {
            res.status(401).json({ success: false, message: '账号或密码错误！' });
        }
    }, 1500);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 