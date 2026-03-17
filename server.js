const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let users = []; 
let messages = []; 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).json({error: "Exists"});
    users.push({ username, password, publicKey, lastSeen: Date.now() });
    res.json({message: "Success"});
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({error: "Wrong"});
    user.lastSeen = Date.now();
    res.json(user);
});

app.post('/reset-password', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) { user.password = req.body.newPassword; res.json({msg: "Done"}); }
    else res.status(404).json({error: "Not found"});
});

app.get('/users', (req, res) => {
    const search = req.query.search || "";
    const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    res.json(filtered.map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        status: (Date.now() - (u.lastSeen || 0) < 40000) ? "online" : "offline"
    })));
});

app.post('/send', (req, res) => {
    messages.push(req.body);
    res.json({success: true});
});

app.get('/messages/:user', (req, res) => {
    const myMsgs = messages.filter(m => m.receiver === req.params.user);
    res.json(myMsgs);
});

app.post('/heartbeat', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) user.lastSeen = Date.now();
    res.sendStatus(200);
});

module.exports = app;
