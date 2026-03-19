const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. الربط الحديدي بالداتابيز (ضد الـ Timeout) ---
const MONGO_URI = process.env.MONGO_URI;

const dbOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4
};

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, dbOptions);
        console.log("✅ MongoDB Cloud Connected & Ready!");
    } catch (err) {
        console.error("❌ Connection failed, retrying...", err.message);
        setTimeout(connectDB, 5000);
    }
};

connectDB();

// --- 2. تعريف الجداول ---
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

function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. الروابط (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// أ- تسجيل مستخدم جديد
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "البيانات ناقصة" });

        const newUser = new User({ 
            username: username.toLowerCase().trim(), 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        res.status(201).json({ message: "Registered Successfully", username: newUser.username });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده محجوز" });
        res.status(500).json({ error: "خطأ في الداتابيز: " + e.message });
    }
});

// ب- تسجيل الدخول (تمت الإضافة والتعديل هنا 🔓)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "يرجى إدخال اليوزر والباسورد" });
        }

        const cleanUser = username.toLowerCase().trim();
        const hashedPass = hashPassword(password);

        // البحث عن المستخدم بمطابقة الاسم والباسورد المشفر
        const user = await User.findOne({ username: cleanUser, password: hashedPass });

        if (!user) {
            return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        }

        // تحديث آخر ظهور للمستخدم (أونلاين)
        user.lastSeen = Date.now();
        await user.save();

        console.log(`👤 User Logged In: ${cleanUser}`);
        res.json({ 
            message: "Success", 
            username: user.username, 
            publicKey: user.publicKey 
        });

    } catch (e) {
        console.error("❌ Login Error:", e.message);
        res.status(500).json({ error: "مشكلة فنية في تسجيل الدخول: " + e.message });
    }
});

// ج- باقي الروابط (Reset Password, Users, Send, Messages) بنفس الترتيب...
app.post('/reset-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: "اليوزر مش موجود" });
        user.password = hashPassword(password);
        await user.save();
        res.json({ message: "تم تحديث الباسورد بنجاح" });
    } catch (e) { res.status(500).json({ error: "فشل التحديث: " + e.message }); }
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
        await new Message({ 
            sender: sender.toLowerCase().trim(), 
            receiver: receiver.toLowerCase().trim(), 
            message 
        }).save();
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

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Server ready on http://localhost:3000`));
}
