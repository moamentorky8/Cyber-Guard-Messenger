const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();

// --- 1. الإعدادات الأساسية ---
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. بديل قاعدة البيانات (عشان فيرسيل يقبل النشر) ---
// ملاحظة: SQLite لا تعمل بشكل مستقر على Vercel Free Tier، لذا سنستخدم التخزين المؤقت
let users = []; 
let messages = []; 

// --- 3. دوال الحماية ---
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// --- 4. المسارات (Routes / APIs) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تسجيل حساب جديد
app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
    }
    const newUser = {
        id: users.length + 1,
        username,
        password: hashPassword(password),
        publicKey,
        lastSeen: Date.now()
    };
    users.push(newUser);
    res.status(201).json({ message: "Registered" });
});

// تسجيل الدخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const hashed = hashPassword(password);
    const user = users.find(u => u.username === username && u.password === hashed);
    
    if (!user) return res.status(401).json({ error: "بيانات خاطئة" });
    user.lastSeen = Date.now();
    res.json({ id: user.id, username: user.username, publicKey: user.publicKey });
});

// إعادة تعيين كلمة المرور
app.post('/reset-password', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    user.password = hashPassword(password);
    res.json({ message: "Updated" });
});

// جلب قائمة المستخدمين (مع دعم البحث والأونلاين اللي ضفناه في الانديكس)
app.get('/users', (req, res) => {
    const search = req.query.search || "";
    const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    
    const result = filtered.map(u => ({
        id: u.id,
        username: u.username,
        publicKey: u.publicKey,
        status: (Date.now() - (u.lastSeen || 0) < 40000) ? "online" : "offline"
    }));
    res.json(result);
});

// إرسال رسالة مشفرة
app.post('/send', (req, res) => {
    const { sender, receiver, message } = req.body; // متوافق مع الأسماء في الانديكس الجديد
    messages.push({
        id: messages.length + 1,
        sender,
        receiver,
        message,
        timestamp: new Date()
    });
    res.json({ success: true });
});

// جلب الرسائل المستلمة (بالاسم كما في الانديكس)
app.get('/messages/:username', (req, res) => {
    const myMsgs = messages.filter(m => m.receiver === req.params.username);
    res.json(myMsgs);
});

// تحديث حالة النشاط
app.post('/heartbeat', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) {
        user.lastSeen = Date.now();
        res.sendStatus(200);
    } else res.sendStatus(404);
});

// --- 5. أهم تعديل لفيرسيل ---
// لازم نصدر التطبيق عشان Vercel يشوفه كـ Function
module.exports = app;

// تشغيل السيرفر لوكال (للشغل على جهازك)
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`🚀 Local server: http://localhost:${PORT}`));
}
