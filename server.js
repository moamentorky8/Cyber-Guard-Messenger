const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let users = []; // [{username, password, publicKey, lastSeen}]
let messages = []; // [{sender, receiver, encryptedMsg, timestamp}]

// 1. تسجيل جديد
app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).json({error: "User exists"});
    users.push({ username, password, publicKey, lastSeen: Date.now() });
    res.status(201).json({message: "Success"});
});

// 2. تسجيل دخول (بيحدث الـ Online)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({error: "Wrong credentials"});
    user.lastSeen = Date.now(); 
    res.json(user);
});

// 3. إعادة تعيين كلمة المرور (القديمة)
app.post('/reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({error: "User not found"});
    user.password = newPassword;
    res.json({message: "Password updated"});
});

// 4. البحث عن اليوزرز + حالة الأونلاين (الجديد)
app.get('/users', (req, res) => {
    const search = req.query.search || "";
    const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    
    const result = filtered.map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        // لو مكلم السيرفر من أقل من 40 ثانية يبقى Online
        status: (Date.now() - (u.lastSeen || 0) < 40000) ? "online" : "offline"
    }));
    res.json(result);
});

// 5. إرسال واستقبال الرسايل (الجديد)
app.post('/send', (req, res) => {
    const { sender, receiver, message } = req.body;
    messages.push({ sender, receiver, message, time: new Date() });
    res.json({success: true});
});

app.get('/messages/:myUsername', (req, res) => {
    const myMsgs = messages.filter(m => m.receiver === req.params.myUsername);
    res.json(myMsgs);
});

// 6. تحديث الـ "أنا صاحي" (Heartbeat)
app.post('/heartbeat', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) user.lastSeen = Date.now();
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
