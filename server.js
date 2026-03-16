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
    users.push({ username, password, publicKey });
    res.status(201).send("Registered");
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).send("Wrong");
    res.json(user);
});

app.get('/users', (req, res) => res.json(users));

app.post('/send', (req, res) => {
    messages.push(req.body);
    res.send("Sent");
});

app.get('/messages/:userId', (req, res) => {
    const userMsgs = messages.filter(m => m.receiverId == req.params.userId);
    res.json(userMsgs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running`));
