const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();

// 1. إعدادات استقبال البيانات (تحصين ضد النصوص المشفرة الطويلة)
app.use(express.json({ limit: '15mb' })); // زودت المساحة شوية عشان الرسالة بقت نسختين
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. ربط Firebase
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
    console.log("🛡️ Neural Link: ACTIVE (E2EE Optimized)");
} catch (e) {
    console.error("❌ Firebase Error:", e.message);
}

const checkDB = (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Database Offline" });
    next();
};

// --- 3. مسارات الهوية (بدون تغيير) ---

app.post('/auth', checkDB, async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: "Auth Fault" }); }
});

app.get('/users', checkDB, async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");
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

app.post('/set-handle', checkDB, async (req, res) => {
    try {
        const { username, handle } = req.body;
        await db.ref(`users/${username.toLowerCase()}`).update({ handle });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

// --- 4. مسارات الرسائل (التعديل هنا ليتماشى مع التشفير المزدوج) ---

app.post('/send', checkDB, async (req, res) => {
    try {
        const { sender, receiver, message, senderCopy } = req.body;
        const msgRef = db.ref("messages").push();
        
        await msgRef.set({
            sender,
            receiver,
            message,      // النسخة المشفرة للمستلم
            senderCopy,   // النسخة المشفرة للمرسل (عشان تظهر عندك)
            id: msgRef.key,
            timestamp: Date.now(),
            edited: false
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Send Fail" }); }
});

app.get('/messages-full/:u1/:u2', checkDB, async (req, res) => {
    try {
        const { u1, u2 } = req.params;
        const snap = await db.ref("messages").limitToLast(100).once("value");
        const all = Object.values(snap.val() || {});
        const filtered = all.filter(m => 
            (m.sender === u1 && m.receiver === u2) || (m.sender === u2 && m.receiver === u1)
        ).sort((a,b) => a.timestamp - b.timestamp);
        res.json(filtered);
    } catch (e) { res.json([]); }
});

app.get('/messages/:user', checkDB, async (req, res) => {
    try {
        const snap = await db.ref("messages")
            .orderByChild("receiver")
            .equalTo(req.params.user)
            .limitToLast(30)
            .once("value");
        res.json(Object.values(snap.val() || {}));
    } catch (e) { res.json([]); }
});

app.post('/edit-msg', checkDB, async (req, res) => {
    try {
        const { id, newVal } = req.body;
        // ملاحظة: الـ newVal هنا لازم يكون Packet مشفرة برضه من الاندكس
        await db.ref(`messages/${id}`).update({ 
            message: newVal, 
            senderCopy: newVal, // بنحدث النسختين في التعديل
            edited: true 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.post('/del-msg', checkDB, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).remove();
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

// --- 5. التشغيل ---

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 Cyber Messenger Operational on Port ${PORT}`);
});
