 const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعداد Firebase بصمام أمان ---
let db;
try {
    const serviceAccount = require("./serviceAccountKey.json");
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app" // تأكد من الرابط ده
        });
    }
    db = admin.database();
    console.log("✅ Neural Link Established with Firebase");
} catch (e) {
    console.error("❌ CRITICAL ERROR: Firebase link failed. Check serviceAccountKey.json");
    // السيرفر مش هيوقع هنا، بس هيدي Error في الـ Logs
}

const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- Middleware للتأكد إن الداتابيز قايمة ---
const checkDb = (req, res, next) => {
    if (!db) return res.status(500).json({ error: "Terminal Offline: Firebase Connection Failed" });
    next();
};

// --- Routes ---

app.post('/auth', checkDb, async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");

        if (isLogin) {
            const user = snap.val();
            if (!user || user.password !== hash(password)) return res.status(401).json({ error: "Access Denied" });
            await ref.update({ publicKey, lastSeen: Date.now() });
            res.json({ username: u, handle: user.handle || u, publicKey: user.publicKey });
        } else {
            if (snap.exists()) return res.status(400).json({ error: "ID Taken" });
            await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), handle: "" });
            res.status(201).json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Auth Process Failed" }); }
});

app.get('/users', checkDb, async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({
        username: u.username,
        handle: u.handle,
        publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
    })));
});

app.post('/send', checkDb, async (req, res) => {
    const msgRef = db.ref("messages").push();
    await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now(), edited: false });
    res.json({ success: true });
});

app.get('/messages-full/:u1/:u2', checkDb, async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const all = Object.values(snap.val() || {});
    const filtered = all.filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
        (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

app.get('/messages/:user', checkDb, async (req, res) => {
    const snap = await db.ref("messages").orderByChild("receiver").equalTo(req.params.user).limitToLast(50).once("value");
    res.json(Object.values(snap.val() || {}));
});

app.post('/edit-msg', checkDb, async (req, res) => {
    await db.ref(`messages/${req.body.id}`).update({ message: req.body.newVal, edited: true });
    res.json({ success: true });
});

app.post('/del-msg', checkDb, async (req, res) => {
    await db.ref(`messages/${req.body.id}`).remove();
    res.json({ success: true });
});

app.post('/set-handle', checkDb, async (req, res) => {
    await db.ref(`users/${req.body.username.toLowerCase()}`).update({ handle: req.body.handle });
    res.json({ success: true });
});

app.post('/reset-pass', checkDb, async (req, res) => {
    await db.ref(`users/${req.body.username.toLowerCase()}`).update({ password: hash(req.body.newPassword) });
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Safe Server running on port ${PORT}`));
