const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();

// إعدادات استقبال البيانات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ربط Firebase
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
    console.error("Firebase Link Error");
}

// المسارات الأساسية
app.post('/auth', async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: "Fault" }); }
});

app.post('/send', async (req, res) => {
    try {
        const msgRef = db.ref("messages").push();
        await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now() });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

app.get('/users', async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");
        const list = Object.values(snap.val() || {}).map(u => ({
            username: u.username, handle: u.handle || u.username, publicKey: u.publicKey
        }));
        res.json(list);
    } catch (e) { res.json([]); }
});

app.get('/messages-full/:u1/:u2', async (req, res) => {
    try {
        const snap = await db.ref("messages").limitToLast(100).once("value");
        const filtered = Object.values(snap.val() || {}).filter(m => 
            (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
            (m.sender === req.params.u2 && m.receiver === req.params.u1)
        );
        res.json(filtered);
    } catch (e) { res.json([]); }
});

app.get('/messages/:user', async (req, res) => {
    try {
        const snap = await db.ref("messages").orderByChild("receiver").equalTo(req.params.user).limitToLast(20).once("value");
        res.json(Object.values(snap.val() || {}));
    } catch (e) { res.json([]); }
});

app.post('/set-handle', async (req, res) => {
    try {
        await db.ref(`users/${req.body.username.toLowerCase()}`).update({ handle: req.body.handle });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Running"));
