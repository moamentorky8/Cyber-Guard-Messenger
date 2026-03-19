const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الرابط بتاعك (تأكد إنه هو ده اللي في المونجو عندك)
const MONGO_URI = "mongodb+srv://amigomomen_db_user:LraKROtj8ErCEboX@cluster0.v6xq9ce.mongodb.net/CyberDB?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to DB"))
    .catch(err => console.log("❌ DB Connection Error: ", err.message));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    publicKey: String,
    lastSeen: { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    sender: String, receiver: String, message: String, timestamp: { type: Date, default: Date.now }
}));

function hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing data" });
        
        const newUser = new User({ username, password: hashPassword(password), publicKey });
        await newUser.save();
        res.status(201).json({ message: "Registered" });
    } catch (e) {
        console.log("Registration Error: ", e.message);
        res.status(400).json({ error: "Username already exists or DB error" });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password: hashPassword(password) });
        if (!user) return res.status(401).json({ error: "Wrong credentials" });
        user.lastSeen = Date.now(); await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.get('/users', async (req, res) => {
    const users = await User.find({});
    res.json(users.map(u => ({
        username: u.username, publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 40000) ? "online" : "offline"
    })));
});

app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Send error" }); }
});

app.get('/messages/:username', async (req, res) => {
    const msgs = await Message.find({ receiver: req.params.username });
    res.json(msgs);
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 http://localhost:3000`));
}
