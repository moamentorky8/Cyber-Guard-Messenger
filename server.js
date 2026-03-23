const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعدادات الربط بـ Firebase ---
if (!admin.apps.length) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            serviceAccount = JSON.parse(rawJson);
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }
            console.log("☁️ Connected via Vercel Secrets");
        } else {
            serviceAccount = require("./serviceAccountKey.json");
            console.log("✅ Connected via Local JSON File");
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    } catch (e) {
        console.error("❌ Firebase Initialization Failed:", e.message);
    }
}

const db = admin.database();

function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 2. المسارات (API Routes) ---

// تسجيل مستخدم جديد
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        if (!username || !password) return res.status(400).json({ error: "بيانات ناقصة" });
        const cleanUser = username.toLowerCase().trim();
        const userRef = db.ref("users/" + cleanUser);
        const snapshot = await userRef.once("value");
        if (snapshot.exists()) return res.status(400).json({ error: "الاسم مسجل بالفعل" });

        await userRef.set({
            username: cleanUser,
            password: hashPassword(password),
            publicKey: publicKey || "",
            lastSeen: Date.now()
        });
        res.status(201).json({ message: "Success", username: cleanUser });
    } catch (e) { res.status(500).json({ error: "خطأ في السيرفر" }); }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = username.toLowerCase().trim();
        const userRef = db.ref("users/" + cleanUser);
        const snapshot = await userRef.once("value");
        const user = snapshot.val();
        if (!user || user.password !== hashPassword(password)) {
            return res.status(401).json({ error: "اليوزر أو الباسورد غلط" });
        }
        await userRef.update({ lastSeen: Date.now() });
        res.json({ username: user.username, publicKey: user.publicKey });
    } catch (e) { res.status(500).json({ error: "فشل الدخول" }); }
});

// قائمة المستخدمين
app.get('/users', async (req, res) => {
    try {
        const snapshot = await db.ref("users").once("value");
        const usersData = snapshot.val() || {};
        const usersList = Object.values(usersData).map(u => ({
            username: u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        }));
        res.json(usersList);
    } catch (e) { res.json([]); }
});

// --- مسارات الجروبات المتطورة ---

// إنشاء جروب وإضافة المنشئ كأول عضو
app.post('/create-group', async (req, res) => {
    try {
        const { groupName, creator } = req.body;
        const groupRef = db.ref("groups").push();
        const members = {};
        members[creator] = true; // إضافة المنشئ تلقائياً

        await groupRef.set({
            name: groupName,
            creator: creator,
            members: members,
            createdAt: Date.now()
        });
        res.json({ success: true, groupId: groupRef.key });
    } catch (e) { res.status(500).json({ error: "فشل إنشاء الجروب" }); }
});

// إضافة عضو جديد للجروب (بواسطة Username)
app.post('/add-member', async (req, res) => {
    try {
        const { groupId, newUser } = req.body;
        const cleanUser = newUser.toLowerCase().trim();
        await db.ref(`groups/${groupId}/members/${cleanUser}`).set(true);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "فشل إضافة العضو" }); }
});

// جلب الجروبات اللي اليوزر مشترك فيها بس (Snap Style)
app.get('/my-groups/:username', async (req, res) => {
    try {
        const user = req.params.username.toLowerCase().trim();
        const snapshot = await db.ref("groups").once("value");
        const allGroups = snapshot.val() || {};
        const myGroups = {};
        
        for (let id in allGroups) {
            if (allGroups[id].members && allGroups[id].members[user]) {
                myGroups[id] = allGroups[id];
            }
        }
        res.json(myGroups);
    } catch (e) { res.json({}); }
});

// إرسال رسالة للجروب
app.post('/send-group', async (req, res) => {
    try {
        const { groupId, sender, message } = req.body;
        await db.ref(`groups/${groupId}/messages`).push({
            sender,
            message,
            timestamp: Date.now()
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "خطأ إرسال" }); }
});

// جلب رسائل الجروب
app.get('/group-messages/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const snapshot = await db.ref(`groups/${groupId}/messages`).once("value");
        res.json(snapshot.val() || {});
    } catch (e) { res.json({}); }
});

// --- نهاية مسارات الجروبات ---

// إرسال رسالة فردية
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        const msgRef = db.ref("messages").push(); 
        await msgRef.set({
            sender,
            receiver: receiver.toLowerCase().trim(),
            message,
            timestamp: Date.now()
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "خطأ إرسال" }); }
});

// استقبال الرسائل الخاصة وحذفها
app.get('/messages/:username', async (req, res) => {
    try {
        const target = req.params.username.toLowerCase().trim();
        const msgRef = db.ref("messages");
        const snapshot = await msgRef.orderByChild("receiver").equalTo(target).once("value");
        const msgsData = snapshot.val() || {};
        const msgsList = Object.values(msgsData);
        if (msgsList.length > 0) {
            const updates = {};
            Object.keys(msgsData).forEach(key => { updates[key] = null; });
            await msgRef.update(updates);
        }
        res.json(msgsList);
    } catch (e) { res.json([]); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Server Running on http://localhost:3000`));
}
