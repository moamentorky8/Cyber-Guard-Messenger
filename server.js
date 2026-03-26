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
    console.error("❌ Firebase Link Failed.");
}

// Middleware لمنع الانهيار (Critical for Vercel stability)
const validateLink = (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Terminal Offline" });
    next();
};

// --- 2. Identity & Access Routes ---

app.post('/auth', validateLink, async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing Credentials" });

        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        const user = snap.val();

        if (isLogin) {
            if (!user || user.password !== password) {
                return res.status(401).json({ error: "Denied" });
            }
            await ref.update({ publicKey, lastSeen: Date.now() });
            return res.json({ username: u, handle: user.handle || "", publicKey: user.publicKey });
        } else {
            if (snap.exists()) return res.status(400).json({ error: "Taken" });
            await ref.set({ 
                username: u, 
                password: password, 
                publicKey: publicKey, 
                lastSeen: Date.now(), 
                handle: "" 
            });
            return res.status(201).json({ success: true });
        }
    } catch (err) { 
        return res.status(500).json({ error: "Fault" }); 
    }
});

// --- 3. Discovery & Messenger Engine ---

app.get('/users', validateLink, async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");
        const data = snap.val() || {};
        const userList = Object.values(data).map(u => ({
            username: u.username,
            handle: u.handle || u.username,
            publicKey: u.publicKey,
            status: (Date.now() - (u.lastSeen || 0) < 60000) ? "online" : "offline"
        }));
        return res.json(userList);
    } catch (e) { 
        return res.json([]); 
    }
});

app.post('/send', validateLink, async (req, res) => {
    try {
        const msgRef = db.ref("messages").push();
        await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now(), edited: false });
        return res.json({ success: true });
    } catch (e) { 
        return res.status(500).json({ error: "Fail" }); 
    }
});

app.get('/messages-full/:u1/:u2', validateLink, async (req, res) => {
    try {
        // تحسين البحث لتقليل استهلاك الذاكرة في فيرسيل
        const snap = await db.ref("messages").limitToLast(200).once("value");
        const all = Object.values(snap.val() || {});
        const filtered = all.filter(m => 
            (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
            (m.sender === req.params.u2 && m.receiver === req.params.u1)
        ).sort((a,b) => a.timestamp - b.timestamp);
        return res.json(filtered);
    } catch (e) { 
        return res.json([]); 
    }
});

app.get('/messages/:user', validateLink, async (req, res) => {
    try {
        const snap = await db.ref("messages").orderByChild("receiver").equalTo(req.params.user).limitToLast(50).once("value");
        return res.json(Object.values(snap.val() || {}));
    } catch (e) { 
        return res.json([]); 
    }
});

// --- 4. Historical Correction & Management ---

app.post('/set-handle', validateLink, async (req, res) => {
    try {
        const { username, handle } = req.body;
        await db.ref(`users/${username.toLowerCase()}`).update({ handle });
        return res.json({ success: true });
    } catch (e) { 
        return res.status(500).json({ error: "Fail" }); 
    }
});

app.post('/edit-msg', validateLink, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).update({ message: req.body.newVal, edited: true });
        return res.json({ success: true });
    } catch (e) { 
        return res.status(500).json({ error: "Fail" }); 
    }
});

app.post('/del-msg', validateLink, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).remove();
        return res.json({ success: true });
    } catch (e) { 
        return res.status(500).json({ error: "Fail" }); 
    }
});

app.post('/reset-pass', validateLink, async (req, res) => {
    try {
        await db.ref(`users/${req.body.username.toLowerCase()}`).update({ password: req.body.newPassword });
        return res.json({ success: true });
    } catch (e) { 
        return res.status(500).json({ error: "Fail" }); 
    }
});

// --- 5. Terminal Deployment ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️ Cyber Messenger Server - Operational on Port ${PORT}`);
});
