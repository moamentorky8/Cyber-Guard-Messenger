const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعدادات الربط السحابي (النسخة الفولاذية) ---
const MONGO_URI = process.env.MONGO_URI;

const dbOptions = {
    serverSelectionTimeoutMS: 30000, // استنى 30 ثانية كاملة (أقصى حاجة)
    socketTimeoutMS: 60000,          // حافظ على القناة مفتوحة دقيقة كاملة
    connectTimeoutMS: 30000,
    family: 4                        // IPv4 لإلغاء أي تأخير في الـ DNS
};

// وظيفة الربط الذكي - بتحاول 3 مرات لو فشلت
const connectDB = async (retryCount = 5) => {
    try {
        if (mongoose.connection.readyState === 1) return;
        console.log("⏳ Attempting to connect to MongoDB Cloud...");
        await mongoose.connect(MONGO_URI, dbOptions);
        console.log("🚀 SUCCESS: MongoDB Atlas is now Online and Stable!");
    } catch (err) {
        console.error(`❌ Connection failed. Retries left: ${retryCount}. Error:`, err.message);
        if (retryCount > 0) {
            setTimeout(() => connectDB(retryCount - 1), 5000);
        }
    }
};

connectDB();

// --- 2. تعريف الجداول (الـ Schemas) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    publicKey: { type: String, default: "" },
    lastSeen: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: { type: String, lowercase: true, trim: true },
    receiver: { type: String, lowercase: true, trim: true },
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. المسارات (API Routes) مع معالجة احترافية للأخطاء ---

// تسجيل مستخدم جديد
app.post('/register', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "السيرفر بيحاول يربط بالداتابيز، جرب كمان ثانية" });
        }
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });

        const cleanUser = username.toLowerCase().trim();
        const newUser = new User({ 
            username: cleanUser, 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        res.status(201).json({ message: "Success", username: newUser.username });
    } catch (e) {
        console.error("Register Error:", e);
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده محجوز" });
        res.status(500).json({ error: "عذراً، جاري تهيئة الداتابيز.. جرب مرة تانية" });
    }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = username.toLowerCase().trim();
        const user = await User.findOne({ username: cleanUser, password: hashPassword(password) });
        
        if (!user) return res.status(401).json({ error: "اليوزر أو الباسورد غلط" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "خطأ فني في السيرفر" }); }
});

// باقي الروابط (Reset, Users, Send, Messages)
app.post('/reset-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: "اليوزر مش موجود" });
        user.password = hashPassword(password);
        await user.save();
        res.json({ message: "تم التحديث" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "فشل الإرسال" }); }
});

app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgs = await Message.find({ receiver: target });
        if (msgs.length > 0) await Message.deleteMany({ receiver: target });
        res.json(msgs);
    } catch (e) { res.json([]); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Local Server: http://localhost:3000`));
}
