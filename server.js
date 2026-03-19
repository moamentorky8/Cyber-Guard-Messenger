const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- الربط الآمن بالسحابة (عن طريق Vercel Environment Variables) ---
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Database Connected Successfully!"))
        .catch(err => console.error("❌ DB Connection Error:", err.message));
} else {
    console.warn("⚠️ تحذير: لم يتم العثور على MONGO_URI في إعدادات Vercel!");
}

// تعريف الجداول (الـ ROM السحابية)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    publicKey: { type: String, default: "" },
    lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// دالة التشفير (SHA-256)
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- الروابط الأساسية ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تسجيل مستخدم جديد (صاروخ 🚀)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });

        const newUser = new User({ 
            username, 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        res.status(201).json({ message: "Registered Successfully" });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده مستخدم قبل كدة!" });
        res.status(500).json({ error: "خطأ في قاعدة البيانات" });
    }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ 
            username: username.toLowerCase(), 
            password: hashPassword(password) 
        });

        if (!user) return res.status(401).json({ error: "اليوزر نيم أو الباسوورد غلط" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "Login Error" }); }
});

// جلب قائمة المستخدمين (البحث)
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

// إرسال رسالة
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "فشل في إرسال الرسالة" }); }
});

// استقبال الرسائل
app.get('/messages/:username', async (req, res) => {
    try {
        const msgs = await Message.find({ receiver: req.params.username.toLowerCase() });
        res.json(msgs);
    } catch (e) { res.json([]); }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 السيرفر السوبر شغال: http://localhost:3000`));
}
