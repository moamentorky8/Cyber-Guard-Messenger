const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعدادات الربط السحابي (Anti-Timeout) ---
const MONGO_URI = process.env.MONGO_URI;

const dbOptions = {
    serverSelectionTimeoutMS: 15000, // يصبر 15 ثانية كاملة للربط
    socketTimeoutMS: 45000,          // يحافظ على استقرار القناة
    family: 4                        // سرعة الوصول عبر IPv4
};

// وظيفة الربط التلقائي
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) return;
        await mongoose.connect(MONGO_URI, dbOptions);
        console.log("🚀 MongoDB Atlas Connected Successfully!");
    } catch (err) {
        console.error("❌ Database Connection Error:", err.message);
        setTimeout(connectDB, 5000); // إعادة محاولة الاتصال كل 5 ثواني لو فشل
    }
};

connectDB();

// --- 2. تعريف قواعد البيانات (Schemas) ---
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

// دالة تشفير الباسورد SHA-256
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. المسارات (API Routes) ---

// أ- تسجيل مستخدم جديد (Register)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });

        const cleanUser = username.toLowerCase().trim();
        const existingUser = await User.findOne({ username: cleanUser });
        
        if (existingUser) return res.status(400).json({ error: "هذا الاسم مسجل بالفعل" });

        const newUser = new User({ 
            username: cleanUser, 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        res.status(201).json({ message: "Success", username: newUser.username });
    } catch (e) {
        res.status(500).json({ error: "خطأ في السيرفر: " + e.message });
    }
});

// ب- تسجيل الدخول (Login)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = username.toLowerCase().trim();
        const hashedPass = hashPassword(password);

        const user = await User.findOne({ username: cleanUser, password: hashedPass });
        if (!user) return res.status(401).json({ error: "اليوزر أو الباسورد غلط" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) {
        res.status(500).json({ error: "فشل الدخول: " + e.message });
    }
});

// ج- إعادة تعيين الباسورد (Reset)
app.post('/reset-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: "اليوزر مش موجود" });

        user.password = hashPassword(password);
        await user.save();
        res.json({ message: "تم تحديث الباسورد" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// د- قائمة المستخدمين
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

// هـ- إرسال واستقبال الرسائل
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "خطأ إرسال" }); }
});

app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgs = await Message.find({ receiver: target });
        if (msgs.length > 0) await Message.deleteMany({ receiver: target });
        res.json(msgs);
    } catch (e) { res.json([]); }
});

// الصفحة الرئيسية (لـ Vercel)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

// للتشغيل المحلي فقط
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Server ready on http://localhost:3000`));
}
