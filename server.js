const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعداد Firebase Neural Link بصمام أمان ---
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
    console.error("❌ Firebase Link Failed. Running in SAFE MODE (Offline).");
}

const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// Middleware لمنع الانهيار (Critical for Vercel stability)
const validateLink = (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Terminal Offline: Firebase Connection Failed" });
    next();
};

// --- 2. Identity & Access Routes ---

app.post('/auth', validateLink, async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        const user = snap.val();

        if (isLogin) {
            if (!user || user.password !== hash(password)) {
                return res.status(401).json({ error: "Access Denied: Invalid Credentials" });
            }
            // تحديث المفتاح العام لضمان مزامنة الهيستوري
            await ref.update({ publicKey, lastSeen: Date.now() });
            res.json({ username: u, handle: user.handle || "", publicKey: user.publicKey });
        } else {
            if (snap.exists()) return res.status(400).json({ error: "Agent ID already exists" });
            await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), handle: "" });
            res.status(201).json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Internal Auth Error" }); }
});

app.post('/set-handle', validateLink, async (req, res) => {
    try {
        const { username, handle } = req.body;
        await db.ref(`users/${username.toLowerCase()}`).update({ handle });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Handle Update Failed" }); }
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
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        }));
        res.json(userList);
    } catch (e) { res.json([]); }
});

app.post('/send', validateLink, async (req, res) => {
    try {
        const msgRef = db.ref("messages").push();
        await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now(), edited: false });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Dispatch Failed" }); }
});

app.get('/messages-full/:u1/:u2', validateLink, async (req, res) => {
    try {
        const snap = await db.ref("messages").once("value");
        const all = Object.values(snap.val() || {});
        const filtered = all.filter(m => 
            (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
            (m.sender === req.params.u2 && m.receiver === req.params.u1)
        ).sort((a,b) => a.timestamp - b.timestamp);
        res.json(filtered);
    } catch (e) { res.json([]); }
});

app.get('/messages/:user', validateLink, async (req, res) => {
    try {
        // جلب آخر الرسايل للانبوكس التاريخي
        const snap = await db.ref("messages").orderByChild("receiver").equalTo(req.params.user).limitToLast(50).once("value");
        res.json(Object.values(snap.val() || {}));
    } catch (e) { res.json([]); }
});

// --- 4. Historical Correction Routes (Edit/Delete) ---

app.post('/edit-msg', validateLink, async (req, res) => {
    try {
        const { id, newVal } = req.body;
        await db.ref(`messages/${id}`).update({ message: newVal, edited: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Correction Failed" }); }
});

app.post('/del-msg', validateLink, async (req, res) => {
    try {
        await db.ref(`messages/${req.body.id}`).remove();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Destruction Failed" }); }
});

app.post('/reset-pass', validateLink, async (req, res) => {
    try {
        await db.ref(`users/${req.body.username.toLowerCase()}`).update({ password: hash(req.body.newPassword) });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Reset Failed" }); }
});

// --- 5. Terminal Deployment ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    =========================================
    🛡️  CYBER TERMINAL SERVER V6 - ONLINE
    🚀  Neural Port: ${PORT}
    📡  Status: Firebase Stable
    =========================================
    `);
});
