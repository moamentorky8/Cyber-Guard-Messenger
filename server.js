const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعدادات الربط بـ Firebase (اللينك الخاص بك) ---
if (!admin.apps.length) {
    admin.initializeApp({
        // Vercel بيستخدم الـ Environment Variables للتحقق من الصلاحيات تلقائياً
        credential: admin.credential.applicationDefault(), 
        databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
    });
}

const db = admin.database();

// دالة تشفير الباسورد SHA-256 (كما هي)
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 2. المسارات (API Routes) باستخدام Firebase ---

// تسجيل مستخدم جديد (Register)
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });

        const cleanUser = username.toLowerCase().trim();
        const userRef = db.ref("users/" + cleanUser);

        // التأكد إذا كان المستخدم موجوداً
        const snapshot = await userRef.once("value");
        if (snapshot.exists()) return res.status(400).json({ error: "الاسم مسجل بالفعل" });

        // حفظ البيانات في Firebase
        await userRef.set({
            username: cleanUser,
            password: hashPassword(password),
            publicKey: publicKey || "",
            lastSeen: Date.now()
        });

        res.status(201).json({ message: "Success", username: cleanUser });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ error: "خطأ في السيرفر السحابي: " + e.message });
    }
});

// تسجيل الدخول (Login)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = username.toLowerCase().trim();
        const userRef = db.ref("users/" + cleanUser);

        const snapshot = await userRef.once("value");
        const user = snapshot.val();

        if (!user || user.password !== hashPassword(password)) {
            return res.status(401).json({ error: "اليوزر أو الباسورد غلط" });
        }

        // تحديث حالة الظهور
        await userRef.update({ lastSeen: Date.now() });
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) {
        res.status(500).json({ error: "فشل الدخول" });
    }
});

// قائمة المستخدمين
app.get('/users', async (req, res) => {
    try {
        const usersRef = db.ref("users");
        const snapshot = await usersRef.once("value");
        const usersData = snapshot.val() || {};
        
        const usersList = Object.values(usersData).map(u => ({
            username: u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        }));
        
        res.json(usersList);
    } catch (e) { res.json([]); }
});

// إرسال واستقبال الرسائل
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        const msgRef = db.ref("messages").push(); // إنشاء ID تلقائي للرسالة
        await msgRef.set({
            sender,
            receiver: receiver.toLowerCase().trim(),
            message,
            timestamp: Date.now()
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "خطأ إرسال" }); }
});

app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgRef = db.ref("messages");
        
        // جلب الرسائل الموجهة لهذا المستخدم
        const snapshot = await msgRef.orderByChild("receiver").equalTo(target).once("value");
        const msgsData = snapshot.val() || {};
        
        // تحويل الكائن لمصفوفة وحذفها بعد القراءة (كما في الكود الأصلي)
        const msgsList = Object.keys(msgsData).map(key => msgsData[key]);
        if (Object.keys(msgsData).length > 0) {
            await msgRef.set(null); // مسح الرسايل بعد الاستلام (تأكد من هذا المنطق لمشروعك)
        }
        
        res.json(msgsList);
    } catch (e) { res.json([]); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Firebase Server Local: http://localhost:3000`));
}
