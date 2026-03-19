const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. الربط بقاعدة البيانات ---
// المغير MONGO_URI لازم يكون موجود في إعدادات Vercel
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI || "")
    .then(() => console.log("✅ MongoDB Cloud Connected Successfully"))
    .catch(err => console.error("❌ Database Connection Error:", err.message));

// --- 2. تعريف الجداول (Schemas) ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    publicKey: { type: String, default: "" },
    lastSeen: { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    sender: { type: String, lowercase: true, trim: true },
    receiver: { type: String, lowercase: true, trim: true },
    message: String,
    timestamp: { type: Date, default: Date.now }
}));

// دالة تشفير كلمة المرور (SHA-256) لحمايتها في الداتابيز
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. الروابط (Routes) ---

// الصفحة الرئيسية
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// أ- تسجيل مستخدم جديد (Register)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "البيانات غير مكتملة" });
        }

        const newUser = new User({ 
            username: username.toLowerCase().trim(), 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        res.status(201).json({ message: "تم التسجيل بنجاح", username: newUser.username });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده مسجل مسبقاً" });
        res.status(500).json({ error: "خطأ في الداتابيز: " + e.message });
    }
});

// ب- تسجيل الدخول (Login)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ 
            username: username.toLowerCase().trim(), 
            password: hashPassword(password) 
        });

        if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { 
        res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" }); 
    }
});

// ج- إعادة تعيين كلمة المرور (Reset Password)
app.post('/reset-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

        user.password = hashPassword(password);
        await user.save();
        res.json({ message: "تم تحديث كلمة المرور بنجاح" });
    } catch (e) { 
        res.status(500).json({ error: "فشل تحديث كلمة المرور" }); 
    }
});

// د- جلب قائمة المستخدمين النشطين
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json(users.map(u => ({
            username: u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        })));
    } catch (e) { res.json([]); }
});

// هـ- إرسال رسالة مشفرة
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ 
            sender: sender.toLowerCase().trim(), 
            receiver: receiver.toLowerCase().trim(), 
            message 
        }).save();
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: "فشل إرسال الرسالة" }); 
    }
});

// و- استقبال الرسائل (وتمسح فوراً بعد القراءة لزيادة الأمان)
app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgs = await Message.find({ receiver: target });
        
        if (msgs.length > 0) {
            await Message.deleteMany({ receiver: target });
        }
        res.json(msgs);
    } catch (e) { res.json([]); }
});

module.exports = app;

// تشغيل السيرفر محلياً للتجربة
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Server running on: http://localhost:3000`));
}
