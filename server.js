const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// التخزين في الذاكرة (Memory) عشان Vercel ما يقعش
let users = []; 
let messages = []; 

// --- 1. العمليات الأساسية (القديمة) ---

// تسجيل مستخدم جديد
app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
    }
    users.push({ 
        username, 
        password, 
        publicKey, 
        lastSeen: Date.now() 
    });
    res.json({ message: "تم إنشاء الحساب بنجاح" });
});

// تسجيل الدخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور خطأ" });
    }
    user.lastSeen = Date.now(); // تحديث حالة النشاط فور الدخول
    res.json(user);
});

// إعادة تعيين كلمة المرور
app.post('/reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    user.password = newPassword;
    res.json({ message: "تم تحديث كلمة المرور بنجاح" });
});

// --- 2. الإضافات الجديدة (البحث والحالة) ---

// جلب المستخدمين مع ميزة البحث وحالة الأونلاين
app.get('/users', (req, res) => {
    const search = req.query.search || "";
    // تصفية المستخدمين بناءً على كلمة البحث
    const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
    
    const result = filtered.map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        // لو آخر ظهور كان أقل من 40 ثانية يبقى أونلاين
        status: (Date.now() - (u.lastSeen || 0) < 40000) ? "online" : "offline"
    }));
    res.json(result);
});

// --- 3. نظام المراسلة المشفرة ---

// إرسال رسالة مشفرة
app.post('/send', (req, res) => {
    const { sender, receiver, message } = req.body;
    messages.push({ 
        sender, 
        receiver, 
        message, // الرسالة بتوصل هنا مشفرة RSA جاهزة من الـ Frontend
        timestamp: Date.now() 
    });
    res.json({ success: true });
});

// استلام الرسائل الخاصة بالمستخدم
app.get('/messages/:username', (req, res) => {
    const myMsgs = messages.filter(m => m.receiver === req.params.username);
    // مسح الرسائل بعد قرائتها (اختياري لتقليل استهلاك الرامات)
    // messages = messages.filter(m => m.receiver !== req.params.username);
    res.json(myMsgs);
});

// تحديث حالة الأونلاين (Heartbeat)
app.post('/heartbeat', (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user) {
        user.lastSeen = Date.now();
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر شغال على بورت ${PORT}`));
