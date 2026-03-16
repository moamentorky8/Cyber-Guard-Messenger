const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تخزين مؤقت في الرامات (بيحل مشكلة الـ 500 تماماً)
let users = [];
let messages = [];

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', (req, res) => {
    users.push(req.body);
    res.status(201).json({ message: "Done" });
});

app.post('/login', (req, res) => {
    const user = users.find(u => u.username === req.body.username && u.password === req.body.password);
    if (user) res.json(user);
    else res.status(401).json({ error: "Wrong" });
});

app.get('/users', (req, res) => res.json(users));

app.post('/send', (req, res) => {
    messages.push(req.body);
    res.json({ success: true });
});

app.get('/messages/:userId', (req, res) => {
    res.json(messages.filter(m => m.receiverId == req.params.userId));
});

module.exports = app; // مهم جداً لـ Vercel
