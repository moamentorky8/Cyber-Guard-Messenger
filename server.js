const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. الربط الآمن بالسحابة ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("⚠️ تحذير: لم يتم العثور على MONGO_URI في إعدادات Vercel!");
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
}, { strict: false });

const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: { type: String, lowercase: true, trim: true },
    receiver: { type: String, lowercase: true, trim: true },
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// دالة التشفير الموحدة (SHA-256)
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 3. الروابط (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تسجيل مستخدم جديد 🚀
// تسجيل مستخدم جديد 🚀 (النسخة اللي بتطبع الإيرور بالتفصيل)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        
        // لوجز عشان نشوف المشكلة في Vercel
        console.log("📝 محاولة تسجيل يوزر جديد:", username);

        if (!username || !password) {
            return res.status(400).json({ error: "بيانات ناقصة يا بطل" });
        }

        const newUser = new User({ 
            username: username.toLowerCase().trim(), 
            password: hashPassword(password), 
            publicKey: publicKey || "" 
        });

        await newUser.save();
        console.log(`✅ تم حفظ المستخدم بنجاح: ${username}`);
        res.status(201).json({ message: "Registered Successfully", username: newUser.username });
    } catch (e) {
        console.error("❌ Database Save Error:", e.message); 
        // هنا السيرفر هيبعتلك السبب الحقيقي في الـ Alert
        res.status(500).json({ error: "خطأ في الداتابيز: " + e.message });
    }
});

        await newUser.save();
        res.status(201).json({ message: "Registered Successfully", username: newUser.username });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "الاسم ده محجوز لعميل تاني!" });
        res.status(500).json({ error: "مشكلة في الداتابيز: " + e.message });
    }
});

// تسجيل الدخول 🔓
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = username.toLowerCase().trim();
        const hashedPass = hashPassword(password);

        const user = await User.findOne({ username: cleanUser, password: hashedPass });

        if (!user) return res.status(401).json({ error: "بيانات غلط (تأكد من اليوزر والباسوورد)" });

        user.lastSeen = Date.now();
        await user.save();
        
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "مشكلة فنية في السيرفر" }); }
});

// --- إضافة جديدة: إعادة تعيين كلمة المرور 🔑 ---
app.post('/reset-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });

        const cleanUser = username.toLowerCase().trim();
        const user = await User.findOne({ username: cleanUser });

        if (!user) return res.status(404).json({ error: "العميل غير موجود في النظام" });

        user.password = hashPassword(password);
        await user.save();

        console.log(`🔑 Password Reset for: ${cleanUser}`);
        res.json({ message: "Password updated successfully" });
    } catch (e) {
        res.status(500).json({ error: "فشل تحديث كلمة المرور: " + e.message });
    }
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

// إرسال رسالة
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

// استقبال الرسائل
app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgs = await Message.find({ receiver: target });
        res.json(msgs);
        
        // مسح الرسائل بعد الاستلام (اختياري لزيادة الأمان)
        if (msgs.length > 0) {
            await Message.deleteMany({ receiver: target });
        }
    } catch (e) { res.json([]); }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 السيرفر السوبر شغال: http://localhost:3000`));
}
