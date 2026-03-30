const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();

// 1. تحصين استقبال البيانات (حاسم لمنع انهيار السيرفر بسبب النصوص المشفرة الطويلة)
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. إعداد Firebase بصمام أمان (Neural Link)
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
    console.log("🛡️ Firebase Neural Link: ACTIVE");
} catch (e) {
    console.error("❌ Firebase Link Failed. Critical error handled.");
}

// Middleware لمنع الانهيار (Vercel Guard)
const validateDB = (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Terminal Offline - DB Link Lost" });
    next();
};

// --- 3. المسارات (Routes) ---

// توثيق الهوية
app.post('/auth', validateDB, async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        if (!username) return res.status(400).json({ error: "Agent ID Required" });
        
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        const user = snap.val();

        if (isLogin) {
            if (!user || user.password !== password) return res.status(401).json({ error: "Denied" });
            await ref.update({ publicKey, lastSeen: Date.now() });
            return res.json({ username: u, handle: user.handle || "", publicKey: publicKey });
        } else {
            if (snap.exists()) return res.status(400).json({ error: "Node Exists" });
            await ref.set({ username: u, password, publicKey, lastSeen: Date.now(), handle: "" });
            return res.status(201).json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Auth Failure" }); }
});

// إرسال الرسايل (Secure Packet Dispatch)
app.post('/send', validateDB, async (req, res) => {
    try {
        if (!req.body.message) return res.status(400).json({ error: "Empty Packet" });
        const msgRef = db.ref("messages").push();
        await msgRef.set({
            ...req.body,
            id: msgRef.key,
            timestamp: Date.now(),
            edited: false
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Transmission Fail" }); }
});

// جلب المستخدمين (Discovery)
app.get('/users', validateDB, async (req, res) => {
    try {
        const snap = await db.ref("users").limitToFirst(100).once("value");
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

// جلب المحادثة الكاملة (Neural Sync)
app.get('/messages-full/:u1/:u2', validateDB, async (req, res) => {
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

// جلب رسائل الـ Inbox
app.get('/messages/:user', validateDB, async (req, res) => {
    try {
        const snap = await db.ref("messages")
            .orderByChild("receiver")
            .equalTo(req.params.user)
            .limitToLast(30)
            .once("value");
        res.json(Object.values(snap.val() || {}));
    } catch (e) { res.json([]); }
});

// --- إضافة وتعديل الهوية (Handle Engine) ---
app.post('/set-handle', validateDB, async (req, res) => {
    try {
        const { username, handle } = req.body;
        if (!username || !handle) return res.status(400).json({ error: "Identity Data Missing" });
        
        await db.ref(`users/${username.toLowerCase()}`).update({ handle: handle });
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: "Database Lock Error" }); 
    }
});

app.post('/edit-msg', validateDB, async (req, res) => {
    try {
        if (!req.body.id) return res.status(400).send();
        await db.ref(`messages/${req.body.id}`).update({ message: req.body.newVal, edited: true });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.post('/del-msg', validateDB, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).remove();
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.post('/reset-pass', validateDB, async (req, res) => {
    try {
        await db.ref(`users/${req.body.username.toLowerCase()}`).update({ password: req.body.newPassword });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

// توجيه نهائي لـ Vercel لضمان عمل SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️ Cyber Messenger Server - Operational on Port ${PORT}`);
});
