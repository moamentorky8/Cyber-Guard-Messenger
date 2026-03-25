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
        await ref.update({ publicKey, lastSeen: Date.now() });
        res.json({ username: u, handle: user.handle || u, publicKey: user.publicKey });
    } else {
        if (snap.exists()) return res.status(400).json({ error: "ID Taken" });
        await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), handle: "" });
        res.status(201).json({ success: true });
    }
});

app.post('/set-handle', async (req, res) => {
    const { username, handle } = req.body;
    await db.ref(`users/${username.toLowerCase()}`).update({ handle });
    res.json({ success: true });
});

app.post('/reset-pass', async (req, res) => {
    const { username, newPassword } = req.body;
    const ref = db.ref(`users/${username.toLowerCase()}`);
    if (!(await ref.once("value")).exists()) return res.status(404).json({error: "User not found"});
    await ref.update({ password: hash(newPassword) });
    res.json({ success: true });
});

// --- Messaging ---
app.post('/send', async (req, res) => {
    const msgRef = db.ref("messages").push();
    await msgRef.set({ ...req.body, id: msgRef.key, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/msgs/:u1/:u2', async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const filtered = Object.values(snap.val() || {}).filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
        (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

// --- Users & Groups ---
app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({ username: u.username, handle: u.handle, publicKey: u.publicKey, status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline" })));
});

app.post('/groups/create', async (req, res) => {
    const ref = db.ref("groups").push();
    await ref.set({ id: ref.key, name: req.body.name, creator: req.body.creator, members: {[req.body.creator]: true} });
    res.json({ success: true });
});

app.post('/groups/add', async (req, res) => {
    await db.ref(`groups/${req.body.gid}/members/${req.body.member.toLowerCase()}`).set(true);
    res.json({ success: true });
});

app.get('/groups-info/:gid', async (req, res) => {
    const snap = await db.ref(`groups/${req.params.gid}`).once("value");
    res.json(snap.val());
});

app.get('/my-groups/:user', async (req, res) => {
    const snap = await db.ref("groups").once("value");
    const mine = Object.values(snap.val() || {}).filter(g => g.members && g.members[req.params.user.toLowerCase()]);
    res.json(mine);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 3000);
