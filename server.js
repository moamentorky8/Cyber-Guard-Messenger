const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. الربط الآمن بالسحابة (عن طريق Vercel Environment Variables) ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("⚠️ خطأ: لم يتم العثور على MONGO_URI في إعدادات Vercel!");
}

mongoose.connect(MONGO_URI || "")
    .then(() => console.log("✅ تم الاتصال بنجاح بـ MongoDB Atlas"))
    .catch(err => console.error("❌ فشل الاتصال بالداتابيز:", err.message));

// --- 2. تعريف الجداول (Schemas) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    publicKey: { type: String, default: "" },
    lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: { type: String, lowercase: true },
    receiver: { type: String, lowercase: true },
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// دالة التشفير (SHA-256)
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. الروابط (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تسجيل مستخدم جديد 🚀
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
        console.error("Register Error Details:", e.message);
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده مستخدم قبل كدة!" });
        res.status(500).json({ error: "مشكلة في الداتابيز: " + e.message });
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

        if (!user) return res.status(401).json({ error: "بيانات غلط" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "Login Error" }); }
});

// جلب قائمة المستخدمين
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

// إرسال واستقبال الرسائل
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to send" }); }
});

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
