const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose'); // إضافة المكتبة المطلوبة

const app = express();

// --- 1. الإعدادات الأساسية ---
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. الربط بقاعدة بيانات جوجل (MongoDB Atlas) ---
// اللينك بتاعك متظبط وجاهز
const MONGO_URI = "mongodb+srv://amigomomen_db_user:LraKROtj8ErCEboX@cluster0.v6xq9ce.mongodb.net/CyberMessengerDB?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ مبروك يا مؤمن.. اتربطنا بقاعدة البيانات الدايمة!"))
    .catch(err => console.error("❌ فشل الاتصال بالمونجو:", err));

// --- 3. تعريف الجداول (Schemas) لضمان حفظ البيانات للأبد ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    publicKey: String,
    fullName: String, // ميزة البروفايل: الاسم الكامل
    bio: String,      // ميزة البروفايل: نبذة
    avatar: String,   // ميزة البروفايل: الصورة
    lastSeen: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// --- 4. دوال الحماية ---
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// --- 5. المسارات (Routes / APIs) المحدثة ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تسجيل حساب جديد مع دعم البروفايل
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey, fullName, bio } = req.body;
        const newUser = new User({
            username,
            password: hashPassword(password),
            publicKey,
            fullName: fullName || username,
            bio: bio || "Cyber Security Agent",
            avatar: "default.png"
        });
        await newUser.save();
        res.status(201).json({ message: "Registered Successfully" });
    } catch (err) {
        res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
    }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const hashed = hashPassword(password);
    const user = await User.findOne({ username, password: hashed });
    
    if (!user) return res.status(401).json({ error: "بيانات خاطئة" });
    user.lastSeen = Date.now();
    await user.save();
    res.json({ id: user._id, username: user.username, publicKey: user.publicKey });
});

// ميزة البحث المتقدم عن المستخدمين (باليوزر أو بالاسم الكامل)
app.get('/users', async (req, res) => {
    const search = req.query.search || "";
    const filtered = await User.find({
        $or: [
            { username: { $regex: search, $options: 'i' } },
            { fullName: { $regex: search, $options: 'i' } }
        ]
    });
    
    const result = filtered.map(u => ({
        username: u.username,
        fullName: u.fullName,
        publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 40000) ? "online" : "offline"
    }));
    res.json(result);
});

// إرسال رسالة وحفظها في قاعدة البيانات
app.post('/send', async (req, res) => {
    const { sender, receiver, message } = req.body;
    const newMessage = new Message({ sender, receiver, message });
    await newMessage.save();
    res.json({ success: true });
});

// جلب الرسائل الخاصة بالمستخدم فقط
app.get('/messages/:username', async (req, res) => {
    const myMsgs = await Message.find({ receiver: req.params.username });
    res.json(myMsgs);
});

// تحديث حالة النشاط
app.post('/heartbeat', async (req, res) => {
    await User.findOneAndUpdate({ username: req.body.username }, { lastSeen: Date.now() });
    res.sendStatus(200);
});

// تصدير التطبيق لفيرسيل
module.exports = app;

// تشغيل السيرفر لوكال
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`🚀 Local server: http://localhost:${PORT}`));
}
