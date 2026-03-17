const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تخزين في الرامات لضمان السرعة وعدم الـ Crash على Vercel
let users = []; 
let messages = []; 

// 1. تسجيل مستخدم
app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).json({error: "المستخدم موجود فعلاً"});
    users.push({ username, password, publicKey, lastSeen: Date.now() });
    res.json({message: "تم التسجيل بنجاح"});
});

// 2. تسجيل دخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({error: "بيانات خاطئة"});
    user.lastSeen = Date.now();
    res.json(user);
});

// 3. إعادة تعيين كلمة المرور
app.post('/reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({error: "المستخدم غير موجود"});
    user.password = newPassword;
    res.json({message: "تم تحديث كلمة المرور"});
});

// 4. البحث وحالة الأونلاين
app.get('/users', (req, res) => {
    const search = req.query.search || "";
    const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    const result = filtered.map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        status: (Date.now() - (u.lastSeen || 0) < 30000) ? "online" : "offline"
    }));
    res.json(result);
});

// 5. إرسال واستقبال الرسايل
app.post('/send', (req, res) => {
    messages.push(req.body); // {sender, receiver, message}
    res.json({success: true});
});

app.get('/messages/:username', (req, res) => {
    const myMsgs = messages.filter(m => m.receiver === req.params.username);
    // بعد ما نبعتهم بنمسحهم من السيرفر عشان ما يتكرروش (اختياري)
    messages = messages.filter(m => m.receiver !== req.params.username);
    res.json(myMsgs);
});

// 6. تحديث النشاط (Heartbeat)
app.post('/heartbeat', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) user.lastSeen = Date.now();
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running!`));
