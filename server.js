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
    } catch (e) { console.error(e); }
}
const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- المسارات ---
app.post('/register', async (req, res) => {
    const { username, password, publicKey } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref("users/" + u);
    if ((await ref.once("value")).exists()) return res.status(400).json({ error: "مسجل مسبقاً" });
    await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now() });
    res.status(201).json({ success: true });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const u = username.toLowerCase().trim();
    const snap = await db.ref("users/" + u).once("value");
    const user = snap.val();
    if (!user || user.password !== hash(password)) return res.status(401).json({ error: "بيانات غلط" });
    await db.ref("users/" + u).update({ lastSeen: Date.now() });
    res.json({ username: u, publicKey: user.publicKey, handle: user.handle || null });
});

// إعادة تعيين الباسورد (اللي رجعناه)
app.post('/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref("users/" + u);
    if (!(await ref.once("value")).exists()) return res.status(404).json({ error: "اليوزر مش موجود" });
    await ref.update({ password: hash(newPassword) });
    res.json({ success: true });
});

app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({ username: u.username, handle: u.handle || u.username, publicKey: u.publicKey, status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline" })));
});

app.post('/add-member', async (req, res) => {
    const { username, handle, groupId, newUser } = req.body;
    if (username && handle) {
        await db.ref(`users/${username}`).update({ handle: handle.toLowerCase().trim() });
        return res.json({ success: true });
    }
    if (groupId && newUser) {
        await db.ref(`groups/${groupId}/members/${newUser.toLowerCase().trim()}`).set(true);
        return res.json({ success: true });
    }
    res.status(400).send();
});

app.post('/create-group', async (req, res) => {
    const { groupName, creator } = req.body;
    const ref = db.ref("groups").push();
    await ref.set({ name: groupName, creator, members: { [creator]: true } });
    res.json({ success: true, groupId: ref.key });
});

app.get('/my-groups/:username', async (req, res) => {
    const u = req.params.username.toLowerCase().trim();
    const snap = await db.ref("groups").once("value");
    const all = snap.val() || {};
    const mine = {};
    for (let id in all) { if (all[id].members && all[id].members[u]) mine[id] = all[id]; }
    res.json(mine);
});

app.post('/delete-group', async (req, res) => {
    const { groupId, username } = req.body;
    const ref = db.ref(`groups/${groupId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().creator === username) {
        await ref.remove();
        res.json({ success: true });
    } else res.status(403).json({ error: "ممنوع" });
});

app.post('/send-group', async (req, res) => {
    await db.ref(`groups/${req.body.groupId}/messages`).push({ sender: req.body.sender, message: req.body.message, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/group-messages/:groupId', async (req, res) => {
    const snap = await db.ref(`groups/${req.params.groupId}/messages`).once("value");
    res.json(snap.val() || {});
});

app.post('/send', async (req, res) => {
    await db.ref("messages").push().set({ sender: req.body.sender, receiver: req.body.receiver.toLowerCase().trim(), message: req.body.message, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/messages/:username', async (req, res) => {
    const u = req.params.username.toLowerCase().trim();
    const snap = await db.ref("messages").orderByChild("receiver").equalTo(u).once("value");
    const msgs = snap.val() || {};
    if (Object.keys(msgs).length > 0) {
        const up = {}; Object.keys(msgs).forEach(k => up[k] = null);
        await db.ref("messages").update(up);
    }
    res.json(Object.values(msgs));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
module.exports = app;
if (process.env.NODE_ENV !== 'production') app.listen(3000);
