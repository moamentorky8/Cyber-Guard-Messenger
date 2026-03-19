const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الرابط بتاعك اللي شغال 100%
const MONGO_URI = "mongodb+srv://amigomomen_db_user:LraKROtj8ErCEboX@cluster0.v6xq9ce.mongodb.net/CyberDB?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Database Connected - Site is Live!"))
    .catch(err => console.log("❌ Connection Error:", err));

// تعريف الجداول (الـ ROM)
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    publicKey: String,
    lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: String, receiver: String, message: String, timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

function hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

// الروابط
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        await new User({ username, password: hashPassword(password), publicKey }).save();
        res.status(201).json({ message: "Registered" });
    } catch (e) { res.status(400).json({ error: "User exists" }); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password: hashPassword(password) });
    if (!user) return res.status(401).json({ error: "Wrong credentials" });
    user.lastSeen = Date.now(); await user.save();
    res.json({ username: user.username, publicKey: user.publicKey });
});

app.get('/users', async (req, res) => {
    const search = req.query.search || "";
    const users = await User.find({ username: { $regex: search, $options: 'i' } });
    res.json(users.map(u => ({
        username: u.username, publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 40000) ? "online" : "offline"
    })));
});

app.post('/send', async (req, res) => {
    const { sender, receiver, message } = req.body;
    await new Message({ sender, receiver, message }).save();
    res.json({ success: true });
});

app.get('/messages/:username', async (req, res) => {
    const msgs = await Message.find({ receiver: req.params.username });
    res.json(msgs);
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Server: http://localhost:3000`));
}
