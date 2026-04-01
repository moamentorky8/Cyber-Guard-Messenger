const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. إعدادات الربط بـ Firebase (النسخة الصخرية النهائية) ---
if (!admin.apps.length) {
    try {
        let serviceAccount;

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            // معالجة ذكية للـ JSON من Environment Variables
            // بنشيل أي مسافات وبنصلح السطور الجديدة في الـ Private Key
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            serviceAccount = JSON.parse(rawJson);
            
            // تصحيح ضروري جداً لمفتاح جوجل السري في بيئة السحاب
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }
            console.log("☁️ Connected via Vercel Secrets");
        } else {
            // الربط المحلي (بكرة في الكلية)
            serviceAccount = require("./serviceAccountKey.json");
            console.log("✅ Connected via Local JSON File");
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    } catch (e) {
        console.error("❌ Firebase Initialization Failed:", e.message);
        // منع السيرفر من الانهيار
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
            });
        }
    }
}

const db = admin.database();

// دالة تشفير الباسورد SHA-256
function hashPassword(p) { 
    return crypto.createHash('sha256').update(p).digest('hex'); 
}

// --- 2. المسارات (API Routes) ---

// تسجيل مستخدم جديد (Register)
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
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ error: "خطأ في السيرفر: " + e.message });
    }
});

// تسجيل الدخول (Login)
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
    } catch (e) {
        res.status(500).json({ error: "فشل الدخول" });
    }
});

// قائمة المستخدمين
app.get('/users', async (req, res) => {
    try {
        const usersRef = db.ref("users");
        const snapshot = await usersRef.once("value");
        const usersData = snapshot.val() || {};
        
        const usersList = Object.values(usersData).map(u => ({
            username: u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"
        }));
        
        res.json(usersList);
    } catch (e) { res.json([]); }
});

// إرسال رسالة مشفرة
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

// استقبال الرسائل وحذفها بعد القراءة (لأغراض الخصوصية)
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
