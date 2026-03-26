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
        // تأكد من وجود ملف المفتاح في نفس المجلد أو استخدام Environment Variables
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
            : require("./serviceAccountKey.json");

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
        console.log("🛡️ Cyber Terminal: Firebase Neural Link Established");
    } catch (e) {
        console.error("❌ Firebase Connection Error:", e.message);
    }
}

const db = admin.database();
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// --- 2. Auth & Identity ---
app.post('/auth', async (req, res) => {
    const { username, password, publicKey, isLogin } = req.body;
    const u = username.toLowerCase().trim();
    const ref = db.ref(`users/${u}`);
    const snap = await ref.once("value");

    if (isLogin) {
        const user = snap.val();
        if (!user || user.password !== hash(password)) {
            return res.status(401).json({ error: "Access Denied: Invalid Credentials" });
        }
        // تحديث المفتاح العام وحالة الظهور عند كل دخول
        await ref.update({ publicKey, lastSeen: Date.now() });
        res.json({ username: u, handle: user.handle || u, publicKey: user.publicKey });
    } else {
        if (snap.exists()) return res.status(400).json({ error: "Agent ID Taken" });
        await ref.set({ 
            username: u, 
            password: hash(password), 
            publicKey, 
            lastSeen: Date.now(), 
            handle: "" 
        });
        res.status(201).json({ success: true });
    }
});

// إعداد النيك نيم (Handle)
app.post('/set-handle', async (req, res) => {
    const { username, handle } = req.body;
    await db.ref(`users/${username.toLowerCase()}`).update({ handle });
    res.json({ success: true });
});

// إعادة تعيين الباسورد
app.post('/reset-pass', async (req, res) => {
    const { username, newPassword } = req.body;
    const ref = db.ref(`users/${username.toLowerCase()}`);
    const snap = await ref.once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Agent Not Found" });
    await ref.update({ password: hash(newPassword) });
    res.json({ success: true });
});

// --- 3. Messaging Engine ---
app.post('/send', async (req, res) => {
    const msgRef = db.ref("messages").push();
    await msgRef.set({ 
        ...req.body, 
        id: msgRef.key, 
        timestamp: Date.now(),
        edited: false 
    });
    res.json({ success: true });
});

// جلب المحادثة الكاملة
app.get('/msgs/:u1/:u2', async (req, res) => {
    const snap = await db.ref("messages").once("value");
    const all = Object.values(snap.val() || {});
    const filtered = all.filter(m => 
        (m.sender === req.params.u1 && m.receiver === req.params.u2) || 
        (m.sender === req.params.u2 && m.receiver === req.params.u1)
    ).sort((a,b) => a.timestamp - b.timestamp);
    res.json(filtered);
});

// جلب البريد الوارد (Inbox)
app.get('/inbox/:user', async (req, res) => {
    // جلب آخر 50 رسالة موجهة للمستخدم
    const snap = await db.ref("messages")
        .orderByChild("receiver")
        .equalTo(req.params.user)
        .limitToLast(50)
        .once("value");
    res.json(Object.values(snap.val() || {}));
});

// --- 4. CRUD Operations ---
app.post('/edit-msg', async (req, res) => {
    const { id, newVal } = req.body;
    await db.ref(`messages/${id}`).update({ message: newVal, edited: true });
    res.json({ success: true });
});

app.post('/del-msg', async (req, res) => {
    await db.ref(`messages/${req.body.id}`).remove();
    res.json({ success: true });
});

// --- 5. Users Synchronization ---
app.get('/users', async (req, res) => {
    const snap = await db.ref("users").once("value");
    const data = snap.val() || {};
    res.json(Object.values(data).map(u => ({
        username: u.username,
        handle: u.handle,
        publicKey: u.publicKey,
        // يعتبر المستخدم أونلاين لو حدث الصفحة في آخر دقيقة
        status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
    })));
});

// --- 6. تشغيل النظام ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Cyber Terminal V5 is Active on Port ${PORT}`);
});
