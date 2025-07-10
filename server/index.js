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
        return JSON.parse(data);
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
    db.users[newQQ] = { nickname, password };
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
    const user = db.users[username];

    if (user && user.password === password) {
        res.json({ success: true, message: 'Login successful.' });
    } else {
        res.status(401).json({ success: false, message: '账号或密码错误！' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 