const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    } catch (e) { console.error("Firebase Error"); }
}

const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- Auth & Identity ---
app.post('/auth', async (req, res) => {
    const { username, password, publicKey, isLogin } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref(`users/${u}`);
    const snap = await ref.once("value");

    if (isLogin) {
        const user = snap.val();
        if (!user || user.password !== hash(password)) return res.status(401).json({ error: "Access Denied" });
        await ref.update({ publicKey, lastSeen: Date.now(), status: 'online' });
        res.json({ username: u, publicKey: user.publicKey });
    } else {
        if (snap.exists()) return res.status(400).json({ error: "ID Taken" });
        await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), status: 'online' });
        res.status(201).json({ success: true });
    }
});

app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({
        username: u.username,
        publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 30000) ? "online" : "offline"
    })));
});

// --- Messaging (Private & Groups) ---
app.post('/send', async (req, res) => {
    const msgRef = db.ref("messages").push();
    await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/msgs/:u1/:u2', async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const all = Object.values(snap.val() || {});
    const filtered = all.filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
        (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

app.get('/inbox/:user', async (req, res) => {
    const snap = await db.ref("messages").orderByChild("receiver").equalTo(req.params.user).limitToLast(20).once("value");
    res.json(Object.values(snap.val() || {}));
});

// --- CRUD ---
app.post('/edit-msg', async (req, res) => {
    await db.ref(`messages/${req.body.id}`).update({ message: req.body.newVal, edited: true });
    res.json({ success: true });
});

app.post('/del-msg', async (req, res) => {
    await db.ref(`messages/${req.body.id}`).remove();
    res.json({ success: true });
});

// --- Groups ---
app.post('/group/create', async (req, res) => {
    const ref = db.ref("groups").push();
    await ref.set({ id: ref.key, name: req.body.name, creator: req.body.user, members: {[req.body.user]: true} });
    res.json({ success: true });
});

app.post('/group/add', async (req, res) => {
    await db.ref(`groups/${req.body.gid}/members/${req.body.member}`).set(true);
    res.json({ success: true });
});

app.post('/group/del', async (req, res) => {
    await db.ref(`groups/${req.body.gid}`).remove();
    res.json({ success: true });
});

app.get('/groups/:user', async (req, res) => {
    const snap = await db.ref("groups").once("value");
    const mine = Object.values(snap.val() || {}).filter(g => g.members && g.members[req.params.user]);
    res.json(mine);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 3000);
