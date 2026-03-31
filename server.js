const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json({ limit: '15mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

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
} catch (e) { console.error("Firebase Error"); }

// --- التعديل اللي هيخلي الرسايل تظهر في الصورة الجاية ---
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message, senderCopy } = req.body;
        const msgRef = db.ref("messages").push();
        
        await msgRef.set({
            sender,
            receiver,
            message,      // نسخة المستقبل
            senderCopy,   // نسختك إنت (دي اللي ناقصة في صورتك!)
            id: msgRef.key,
            timestamp: Date.now(),
            edited: false
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

// باقي المسارات (Messages-Full)
app.get('/messages-full/:u1/:u2', async (req, res) => {
    try {
        const snap = await db.ref("messages").limitToLast(50).once("value");
        const all = Object.values(snap.val() || {});
        const filtered = all.filter(m => 
            (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
            (m.sender === req.params.u2 && m.receiver === req.params.u1)
        ).sort((a,b) => a.timestamp - b.timestamp);
        res.json(filtered);
    } catch (e) { res.json([]); }
});

// مسارات الـ Auth والـ Handle (بدون تغيير)
app.post('/auth', async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        if (isLogin) {
            const user = snap.val();
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

app.get('/users', async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");
        res.json(Object.values(snap.val() || {}).map(u => ({
            username: u.username, handle: u.handle || u.username, publicKey: u.publicKey
        })));
    } catch (e) { res.json([]); }
});

app.post('/set-handle', async (req, res) => {
    try {
        await db.ref(`users/${req.body.username.toLowerCase()}`).update({ handle: req.body.handle });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = app;
