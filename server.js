const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();

// 1. تحصين استقبال البيانات لضمان عدم سقوط الـ Node process
app.use(express.json({ limit: '10mb' })); // 10 ميجا كافية جداً للتشفير وتمنع استنزاف الرام
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. إعداد Firebase مع صمام أمان للاتصال
let db;
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
        : require("./serviceAccountKey.json");

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    }
    db = admin.database();
} catch (e) {
    console.error("❌ Firebase neural link failure.");
}

const validateLink = (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Database Offline" });
    next();
};

// 3. مسارات الوصول (Identity)
app.post('/auth', validateLink, async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        const user = snap.val();

        if (isLogin) {
            if (!user || user.password !== password) return res.status(401).json({ error: "Denied" });
            await ref.update({ publicKey, lastSeen: Date.now() });
            return res.json({ username: u, handle: user.handle || "", publicKey: publicKey });
        } else {
            if (snap.exists()) return res.status(400).json({ error: "Taken" });
            await ref.set({ username: u, password, publicKey, lastSeen: Date.now(), handle: "" });
            return res.status(201).json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Internal Fault" }); }
});

// 4. المحرك الأساسي (Messenger Engine) - تحصين فيرسيل هنا
app.get('/messages-full/:u1/:u2', validateLink, async (req, res) => {
    try {
        const { u1, u2 } = req.params;
        // القضاء على جراثيم "فلترة الرام": هنجيب آخر 100 رسالة فقط لتقليل استهلاك الذاكرة
        const snap = await db.ref("messages").limitToLast(100).once("value");
        const data = snap.val() || {};
        
        // فلترة سريعة جداً
        const filtered = Object.values(data).filter(m => 
            (m.sender === u1 && m.receiver === u2) || (m.sender === u2 && m.receiver === u1)
        ).sort((a, b) => a.timestamp - b.timestamp);
        
        return res.json(filtered);
    } catch (e) { res.json([]); }
});

app.post('/send', validateLink, async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        if (!message) return res.status(400).json({ error: "Packet Empty" });

        const msgRef = db.ref("messages").push();
        await msgRef.set({
            sender, receiver, message,
            timestamp: Date.now(),
            id: msgRef.key,
            edited: false
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get('/users', validateLink, async (req, res) => {
    try {
        // سحب اليوزرات مع استثناء البيانات الحساسة فوراً
        const snap = await db.ref("users").limitToFirst(50).once("value");
        const data = snap.val() || {};
        const list = Object.values(data).map(u => ({
            username: u.username,
            handle: u.handle || u.username,
            publicKey: u.publicKey,
            status: (Date.now() - (u.lastSeen || 0) < 120000) ? "online" : "offline"
        }));
        res.json(list);
    } catch (e) { res.json([]); }
});

// 5. العمليات التاريخية (Correction)
app.post('/edit-msg', validateLink, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).update({ 
            message: req.body.newVal, 
            edited: true 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

app.post('/del-msg', validateLink, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).remove();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

// توجيه نهائي لـ فيرسيل
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ Cyber-Core Operational`));
