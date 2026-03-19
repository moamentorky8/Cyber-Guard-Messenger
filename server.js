const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. الربط بقاعدة البيانات (تأكد من الرابط والباسوورد)
const MONGO_URI = "mongodb+srv://amigomomen_db_user:LraKROtj8ErCEboX@cluster0.v6xq9ce.mongodb.net/CyberDB?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Cloud Database Connected!"))
    .catch(err => console.error("❌ Connection Error:", err.message));

// 2. تعريف جدول المستخدمين (مبسط جداً عشان ما يهنجش)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    publicKey: { type: String, default: "" }, // مش Unique عشان لو المتصفح مبعتوش ما يضربش
    lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// 3. تعريف جدول الرسائل
const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// دالة التشفير
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- الروابط (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تسجيل مستخدم جديد (صاروخ 🚀)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "بيانات ناقصة!" });
        }

        // إنشاء اليوزر وحفظه
        const newUser = new User({ 
            username, 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        console.log(`👤 New User Registered: ${username}`);
        res.status(201).json({ message: "Registered Successfully" });

    } catch (e) {
        console.error("Registration Error:", e.message);
        // لو اليوزر موجود أصلاً
        if (e.code === 11000) {
            return res.status(400).json({ error: "الاسم ده محجوز لعميل تاني!" });
        }
        res.status(500).json({ error: "مشكلة فنية في السيرفر" });
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

        if (!user) return res.status(401).json({ error: "بيانات غلط يا بطل" });

        user.lastSeen = Date.now();
        await user.save();
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) {
        res.status(500).json({ error: "Server Error" });
    }
});

// جلب المستخدمين
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}).select('username publicKey lastSeen');
        res.json(users.map(u => ({
            username: u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        })));
    } catch (e) { res.status(500).json([]); }
});

// إرسال رسالة
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        await new Message({ sender, receiver, message }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to send" }); }
});

// استقبال الرسائل
app.get('/messages/:username', async (req, res) => {
    try {
        const msgs = await Message.find({ receiver: req.params.username.toLowerCase() });
        res.json(msgs);
    } catch (e) { res.status(500).json([]); }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Final Server: http://localhost:3000`));
}
