const express = require('express');

const crypto = require('crypto');

const path = require('path');

const admin = require("firebase-admin");



const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));



// --- 1. إعدادات Firebase ---

if (!admin.apps.length) {

    try {

        let serviceAccount;

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {

            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT.trim();

            serviceAccount = JSON.parse(rawJson);

            if (serviceAccount.private_key) {

                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

            }

        } else {

            serviceAccount = require("./serviceAccountKey.json");

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



// تسجيل مستخدم (Register)

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

            handle: "", // بيبدأ فاضي للسيت أب

            lastSeen: Date.now()

        });



        res.status(201).json({ message: "Success", username: cleanUser, handle: "" });

    } catch (e) {

        res.status(500).json({ error: "خطأ سيرفر" });

    }

});



// تسجيل دخول (Login)

app.post('/login', async (req, res) => {

    try {

        const { username, password } = req.body;

        const cleanUser = username.toLowerCase().trim();

        const userRef = db.ref("users/" + cleanUser);



        const snapshot = await userRef.once("value");

        const user = snapshot.val();



        if (!user || user.password !== hashPassword(password)) {

            return res.status(401).json({ error: "بيانات خطأ" });

        }



        await userRef.update({ lastSeen: Date.now() });

        res.json({ username: user.username, handle: user.handle || "", publicKey: user.publicKey });

    } catch (e) {

        res.status(500).json({ error: "فشل الدخول" });

    }

});



// إعداد النيك نيم (Identity Setup)

app.post('/set-handle', async (req, res) => {

    try {

        const { username, handle } = req.body;

        if (!username || !handle) return res.status(400).json({ error: "بيانات ناقصة" });
        const cleanUser = username.toLowerCase().trim();

        await db.ref("users/" + cleanUser).update({ handle: handle });

        res.json({ success: true });

    } catch (e) {

        res.status(500).json({ error: "فشل تحديث الهوية" });

    }

});
// البحث عن مستخدمين
app.get('/users', async (req, res) => {
    try {
        const search = (req.query.search || "").toLowerCase().trim();
        const snapshot = await db.ref("users").once("value");
        const usersData = snapshot.val() || {};
        const usersList = Object.values(usersData)
.filter(u => u.username.includes(search) || (u.handle && u.handle.toLowerCase().includes(search)))
            .map(u => ({
username: u.username,
 handle: u.handle || "",
publicKey: u.publicKey,
status: (Date.now() - u.lastSeen < 60000) ? "online" : "offline"

            }));

        res.json(usersList);

    } catch (e) { res.json([]); }

});
// إرسال رسالة (دعم النسخة المزدوجة للهيستوري)
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message, senderCopy } = req.body;

        const msgRef = db.ref("messages").push(); 

        await msgRef.set({

            sender: sender.toLowerCase().trim(),

            receiver: receiver.toLowerCase().trim(),

            message,       // نسخة المستلم

            senderCopy: senderCopy || null, // نسختك إنت عشان الهيستوري

            timestamp: Date.now()

        });

        res.json({ success: true });

    } catch (e) { res.status(500).json({ error: "خطأ إرسال" }); }

});
// جلب الرسائل (بدون حذف فوراً لدعم الهيستوري)

app.get('/messages/:username', async (req, res) => {

    try {

        const user = req.params.username.toLowerCase().trim();

        const snapshot = await db.ref("messages").once("value");

        const allMsgs = snapshot.val() || {};

        

        // جلب الرسايل اللي إنت طرف فيها (مرسل أو مستلم)

        const myMsgs = Object.values(allMsgs).filter(m => 

            m.receiver === user || m.sender === user

        );     res.json(myMsgs);

    } catch (e) { res.json([]); }

});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
module.exports = app;
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log(`🚀 Security Server Running on Port 3000`));

}
