const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!admin.apps.length) {
    try {
        let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require("./serviceAccountKey.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    } catch (e) { console.error("Firebase Error:", e); }
}

const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- IDENTITY PROTOCOLS ---

app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        if ((await ref.once("value")).exists()) return res.status(400).json({ error: "Node exists" });
        await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), handle: u, status: 'online' });
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const u = username.toLowerCase().trim();
    const snap = await db.ref(`users/${u}`).once("value");
    const user = snap.val();
    if (!user || user.password !== hash(password)) return res.status(401).json({ error: "Denied" });
    await db.ref(`users/${u}`).update({ lastSeen: Date.now(), status: 'online' });
    res.json({ username: u, publicKey: user.publicKey, handle: user.handle || u });
});

app.post('/update-key', async (req, res) => {
    await db.ref(`users/${req.body.username.toLowerCase().trim()}`).update({ publicKey: req.body.publicKey });
    res.json({ success: true });
});

// --- MESSAGING WITH ENCRYPTION CHECK ---

app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        
        // [ميزة البرو ماكس]: السيرفر يتأكد إن الرسالة مشفرة بصيغة Base64 قبل الحفظ
        const isBase64 = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(message);
        
        if (!isBase64) {
            return res.status(400).json({ error: "Insecure Payload: Transmission must be RSA encrypted" });
        }

        const msgRef = db.ref("messages").push();
        await msgRef.set({
            id: msgRef.key,
            sender,
            receiver: receiver.toLowerCase().trim(),
            message, // الرسالة المشفرة القادمة من الانديكس
            timestamp: Date.now(),
            encrypted: true // وسم لزيادة الأمان
        });
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
});

app.get('/messages/:username', async (req, res) => {
    const u = req.params.username.toLowerCase().trim();
    const snap = await db.ref("messages").orderByChild("receiver").equalTo(u).limitToLast(50).once("value");
    res.json(Object.values(snap.val() || {}).sort((a,b) => b.timestamp - a.timestamp));
});

app.get('/messages-full/:u1/:u2', async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const filtered = Object.values(snap.val() || {}).filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

// --- GROUP MANAGEMENT ---

app.post('/create-group', async (req, res) => {
    const ref = db.ref("groups").push();
    await ref.set({ name: req.body.groupName, creator: req.body.creator, members: { [req.body.creator]: true } });
    res.json({ success: true });
});

app.post('/add-member-by-handle', async (req, res) => {
    const h = req.body.handle.toLowerCase().trim();
    const snap = await db.ref("users").orderByChild("handle").equalTo(h).once("value");
    if (!snap.exists()) return res.status(404).send();
    const userKey = Object.keys(snap.val())[0];
    await db.ref(`groups/${req.body.groupId}/members/${userKey}`).set(true);
    res.json({ success: true });
});

app.post('/remove-group-member', async (req, res) => {
    const { groupId, username } = req.body;
    await db.ref(`groups/${groupId}/members/${username.toLowerCase().trim()}`).remove();
    res.json({ success: true });
});

app.get('/my-groups/:username', async (req, res) => {
    const snap = await db.ref("groups").once("value");
    const all = snap.val() || {};
    const mine = {};
    for (let id in all) { if (all[id].members && all[id].members[req.params.username.toLowerCase()]) mine[id] = all[id]; }
    res.json(mine);
});

app.post('/send-group', async (req, res) => {
    const msgRef = db.ref(`groups/${req.body.groupId}/messages`).push();
    await msgRef.set({ id: msgRef.key, sender: req.body.sender, message: req.body.message, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/group-messages/:groupId', async (req, res) => {
    const snap = await db.ref(`groups/${req.params.groupId}/messages`).once("value");
    res.json(Object.values(snap.val() || {}).sort((a,b) => a.timestamp - b.timestamp));
});

// --- CRUD ---

app.post('/edit-message', async (req, res) => {
    const ref = db.ref(`messages/${req.body.msgId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().sender === req.body.sender) {
        await ref.update({ message: req.body.newVal, edited: true });
        res.json({ success: true });
    } else res.status(403).send();
});

app.post('/delete-message', async (req, res) => {
    const ref = db.ref(`messages/${req.body.msgId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().sender === req.body.sender) {
        await ref.remove();
        res.json({ success: true });
    } else res.status(403).send();
});

app.post('/delete-group', async (req, res) => {
    const ref = db.ref(`groups/${req.body.groupId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().creator === req.body.username) {
        await ref.remove();
        res.json({ success: true });
    } else res.status(403).send();
});

app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    res.json(Object.values(snap.val() || {}).map(u => ({ username: u.username, handle: u.handle, publicKey: u.publicKey, status: (Date.now() - u.lastSeen < 120000) ? "online" : "offline" })));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(3000, () => console.log(`Cyber Server Active` Swan-Dive Edition));

module.exports = app;
