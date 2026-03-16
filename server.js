const express = require('express');
const crypto = require('crypto');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// بديل قاعدة البيانات (عشان نخلص من الـ 500 Error)
let users = [];
let messages = [];

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).send("User exists");
    users.push({ id: users.length + 1, username, password: hashPassword(password), publicKey });
    res.status(201).send("Registered");
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === hashPassword(password));
    if (!user) return res.status(401).send("Wrong credentials");
    res.json(user);
});

app.get('/users', (req, res) => res.json(users.map(u => ({ id: u.id, username: u.username, publicKey: u.publicKey }))));

app.post('/send', (req, res) => {
    messages.push(req.body);
    res.send("Sent");
});

app.get('/messages/:userId', (req, res) => {
    const userMsgs = messages.filter(m => m.receiverId == req.params.userId);
    res.json(userMsgs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is LIVE on port ${PORT}`));
