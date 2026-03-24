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
    } catch (e) { console.error("Firebase Auth Error:", e); }
}

const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// 1. التسجيل
app.post('/register', async (req, res) => {
    const { username, password, publicKey } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref("users/" + u);
    if ((await ref.once("value")).exists()) return res.status(400).json({ error: "Agent ID taken" });
    await ref.set({ username: u, password: hash(password), publicKey, lastSeen: Date.now(), handle: u });
    res.status(201).json({ success: true });
});

// 2. الدخول
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const u = username.toLowerCase().trim();
    const snap = await db.ref("users/" + u).once("value");
    const user = snap.val();
    if (!user || user.password !== hash(password)) return res.status(401).json({ error: "Access Denied" });
    await db.ref("users/" + u).update({ lastSeen: Date.now() });
    res.json({ username: u, publicKey: user.publicKey, handle: user.handle || u });
});

// 3. إعادة تعيين الباسورد
app.post('/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref("users/" + u);
    if (!(await ref.once("value")).exists()) return res.status(404).json({ error: "Agent not found" });
    await ref.update({ password: hash(newPassword) });
    res.json({ success: true });
});

// 4. جلب المستخدمين (بالهاندل)
app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({
        username: u.username,
        handle: u.handle || u.username,
        publicKey: u.publicKey,
        status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
    })));
});

// 5. تحديث الهوية (Setup Identity)
app.post('/add-member', async (req, res) => {
    const { username, handle } = req.body;
    await db.ref(`users/${username}`).update({ handle: handle.toLowerCase().trim() });
    res.json({ success: true });
});

// 6. إضافة عضو للجروب عن طريق الـ Handle (الميزة اللي طلبتها)
app.post('/add-member-by-handle', async (req, res) => {
    const { groupId, handle } = req.body;
    const h = handle.toLowerCase().trim();
    const userSnap = await db.ref("users").orderByChild("handle").equalTo(h).once("value");
    if (!userSnap.exists()) return res.status(404).json({ error: "Agent @nickname not found" });
    
    const userKey = Object.keys(userSnap.val())[0];
    await db.ref(`groups/${groupId}/members/${userKey}`).set(true);
    res.json({ success: true });
});

// 7. إرسال رسالة خاصة (Private) وحفظها
app.post('/send', async (req, res) => {
    const { sender, receiver, message } = req.body;
    const r = receiver.toLowerCase().trim();
    const msgRef = db.ref("messages").push();
    await msgRef.set({ id: msgRef.key, sender, receiver: r, message, timestamp: Date.now() });
    res.json({ success: true });
});

// 8. جلب رسايل الخاص (للمزامنة والحفظ)
app.get('/messages/:u1/:u2', async (req, res) => {
    const { u1, u2 } = req.params;
    const snap = await db.ref("messages").once("value");
    const all = snap.val() || {};
    const filtered = Object.values(all).filter(m => 
        (m.sender === u1 && m.receiver === u2) || (m.sender === u2 && m.receiver === u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

// 9. الجروبات
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

app.post('/send-group', async (req, res) => {
    const { groupId, sender, message } = req.body;
    const msgRef = db.ref(`groups/${groupId}/messages`).push();
    await msgRef.set({ id: msgRef.key, sender, message, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/group-messages/:groupId', async (req, res) => {
    const snap = await db.ref(`groups/${req.params.groupId}/messages`).once("value");
    const msgs = snap.val() || {};
    res.json(Object.values(msgs).sort((a,b) => a.timestamp - b.timestamp));
});

// 10. التعديل والحذف (Live CRUD)
app.post('/edit-message', async (req, res) => {
    const { msgId, newVal, sender } = req.body;
    // البحث في الرسائل الخاصة
    const pRef = db.ref(`messages/${msgId}`);
    const pSnap = await pRef.once("value");
    if (pSnap.exists() && pSnap.val().sender === sender) {
        await pRef.update({ message: newVal });
        return res.json({ success: true });
    }
    // لو مش خاصة، ندور في الجروبات (تبسيطاً للمشروع)
    res.json({ success: false, error: "Not authorized or not found" });
});

app.post('/delete-message', async (req, res) => {
    const { msgId, sender } = req.body;
    const pRef = db.ref(`messages/${msgId}`);
    const pSnap = await pRef.once("value");
    if (pSnap.exists() && pSnap.val().sender === sender) {
        await pRef.remove();
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.post('/delete-group', async (req, res) => {
    const { groupId, username } = req.body;
    const ref = db.ref(`groups/${groupId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().creator === username) {
        await ref.remove();
        res.json({ success: true });
    } else res.status(403).json({ error: "Access Denied" });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cyber Server Terminal Active on Port ${PORT}`));

module.exports = app;
