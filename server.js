const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require('firebase-admin');

// 1. إعداد الاتصال بجوجل (Firebase Realtime Database)
const serviceAccount = require('./serviceAccount.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // استبدل الرابط اللي تحت بالرابط اللي آخره firebaseio.com بتاعك
  databaseURL: "https://cybermessenger-default-rtdb.firebaseio.com/" 
});

const db = admin.database();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 2. دالة تشفير الباسوورد (عشان الأمان)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 3. المسارات (Routes)

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تسجيل حساب جديد في جوجل Cloud
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey, fullName, bio } = req.body;
        const userRef = db.ref('users/' + username);

        // التأكد إذا كان المستخدم موجوداً
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            return res.status(400).json({ error: "Agent already exists!" });
        }

        await userRef.set({
            username,
            password: hashPassword(password),
            publicKey: publicKey, // مفتاح الـ RSA
            fullName: fullName || username,
            bio: bio || "Cyber Security Agent",
            lastSeen: Date.now()
        });

        res.status(201).json({ message: "Identity created on Google Cloud" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const userRef = db.ref('users/' + username);
        const snapshot = await userRef.once('value');
        const user = snapshot.val();

        if (!user || user.password !== hashPassword(password)) {
            return res.status(401).json({ error: "Invalid Credentials" });
        }

        // تحديث آخر ظهور
        await userRef.update({ lastSeen: Date.now() });
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// جلب المستخدمين مع ميزة البحث المتقدم (بالاسم أو اليوزر)
app.get('/users', async (req, res) => {
    try {
        const search = (req.query.search || "").toLowerCase();
        const usersRef = db.ref('users');
        const snapshot = await usersRef.once('value');
        const allUsers = snapshot.val() || {};

        const result = Object.values(allUsers)
            .filter(u => 
                u.username.toLowerCase().includes(search) || 
                (u.fullName && u.fullName.toLowerCase().includes(search))
            )
            .map(u => ({
                username: u.username,
                fullName: u.fullName,
                publicKey: u.publicKey,
                status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
            }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// إرسال رسالة مشفرة وحفظها للأبد
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        const msgRef = db.ref('messages').push(); // إنشاء سطر جديد تلقائي

        await msgRef.set({
            sender,
            receiver,
            message,
            timestamp: Date.now()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// جلب رسائل المستخدم فقط (Real-time Fetch)
app.get('/messages/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const msgRef = db.ref('messages');
        
        // جلب الرسائل التي تخص هذا المستخدم فقط
        const snapshot = await msgRef.orderByChild('receiver').equalTo(username).once('value');
        const msgs = snapshot.val() || {};
        
        res.json(Object.values(msgs));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// تحديث حالة النشاط (Heartbeat)
app.post('/heartbeat', async (req, res) => {
    const { username } = req.body;
    if (username) {
        await db.ref('users/' + username).update({ lastSeen: Date.now() });
    }
    res.sendStatus(200);
});

// تصدير التطبيق لفيرسيل
module.exports = app;

// تشغيل السيرفر لوكال (للتجربة)
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Google Cloud Server: http://localhost:3000`));
}
