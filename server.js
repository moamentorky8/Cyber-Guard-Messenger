const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعداد Firebase ---
if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
            : require("./serviceAccountKey.json");
            
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    } catch (e) {
        console.error("Firebase Error: Check your service account key.");
    }
}

const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- 2. نظام الدخول والتسجيل ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const u = username.toLowerCase().trim();
    const snap = await db.ref(`users/${u}`).once("value");
    const user = snap.val();

    if (user && user.password === hash(password)) {
        await db.ref(`users/${u}`).update({ lastSeen: Date.now() });
        res.json({ username: u, publicKey: user.publicKey });
    } else {
        res.status(401).json({ error: "Access Denied: Invalid Credentials" });
    }
});

app.post('/register', async (req, res) => {
    const { username, password, publicKey } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref(`users/${u}`);
    const snap = await ref.once("value");

    if (snap.exists()) {
        return res.status(400).json({ error: "Agent ID already exists in the grid." });
    }

    await ref.set({
        username: u,
        password: hash(password),
        publicKey: publicKey,
        lastSeen: Date.now()
    });
    res.status(201).json({ success: true });
});

// --- 3. تحديث المفاتيح (مهم جداً لحل مشكلة التشفير) ---
app.post('/update-key', async (req, res) => {
    const { username, publicKey } = req.body;
    await db.ref(`users/${username.toLowerCase()}`).update({ publicKey });
    res.json({ success: true });
});

// --- 4. نظام الرسائل (Private Messages) ---
app.post('/send', async (req, res) => {
    const msgRef = db.ref("messages").push();
    await msgRef.set({
        ...req.body,
        id: msgRef.key,
        timestamp: Date.now()
    });
    res.json({ success: true });
});

app.get('/messages-full/:u1/:u2', async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const msgs = Object.values(snap.val() || {});
    const filtered = msgs.filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
        (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a, b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

// --- 5. نظام البحث والمستخدمين ---
app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        // الشخص يعتبر أونلاين لو كان آخر نشاط ليه من أقل من دقيقة
        status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
    })));
});

// --- 6. تشغيل السيرفر ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    =========================================
    🛡️  CYBER TERMINAL V4 IS ONLINE
    🚀  Port: ${PORT}
    🌐  Firebase Connected
    =========================================
    `);
});
