const express = require('express');
const path = require('path');
const admin = require("firebase-admin");

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let db;

/* ================= FIREBASE INIT ================= */
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : require("./serviceAccountKey.json"); // محلي فقط

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
    }

    db = admin.database();

} catch (e) {
    console.error("🔥 Firebase Init Error:", e);
}

/* ================= SEND MESSAGE ================= */
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message, senderCopy } = req.body;

        if (!sender || !receiver || !message || !senderCopy) {
            return res.status(400).json({ error: "Invalid data" });
        }

        const msgRef = db.ref("messages").push();

        await msgRef.set({
            sender: sender.toLowerCase().trim(),
            receiver: receiver.toLowerCase().trim(),
            message,
            senderCopy,
            id: msgRef.key,
            timestamp: Date.now(),
            edited: false
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Fail" });
    }
});

/* ================= GET CHAT ================= */
app.get('/messages-full/:u1/:u2', async (req, res) => {
    try {
        const u1 = req.params.u1.toLowerCase();
        const u2 = req.params.u2.toLowerCase();

        const snap = await db.ref("messages").limitToLast(100).once("value");
        const all = Object.values(snap.val() || {});

        const filtered = all.filter(m =>
            (m.sender === u1 && m.receiver === u2) ||
            (m.sender === u2 && m.receiver === u1)
        ).sort((a, b) => a.timestamp - b.timestamp);

        res.json(filtered);

    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

/* ================= AUTH ================= */
app.post('/auth', async (req, res) => {
    try {
        const { username, password, publicKey, isLogin } = req.body;

        if (!username || !password || !publicKey) {
            return res.status(400).json({ error: "Missing data" });
        }

        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");

        if (isLogin) {
            const user = snap.val();

            if (!user || user.password !== password) {
                return res.status(401).json({ error: "Denied" });
            }

            await ref.update({
                publicKey,
                lastSeen: Date.now()
            });

            return res.json({
                username: u,
                handle: user.handle || "",
                publicKey
            });

        } else {
            if (snap.exists()) {
                return res.status(400).json({ error: "Username already taken" });
            }

            await ref.set({
                username: u,
                password,
                publicKey,
                handle: "",
                lastSeen: Date.now()
            });

            return res.status(201).json({
                username: u,
                handle: "",
                publicKey
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fault" });
    }
});

/* ================= GET USERS ================= */
app.get('/users', async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");

        const users = Object.values(snap.val() || {})
            .filter(u => u.publicKey) // 🔥 مهم للتشفير
            .map(u => ({
                username: u.username,
                handle: u.handle || u.username,
                publicKey: u.publicKey
            }));

        res.json(users);

    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

/* ================= SET HANDLE ================= */
app.post('/set-handle', async (req, res) => {
    try {
        const { username, handle } = req.body;

        if (!username || !handle) {
            return res.status(400).json({ error: "Missing data" });
        }

        const u = username.toLowerCase().trim();

        await db.ref(`users/${u}`).update({
            handle: handle.trim()
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Fail" });
    }
});

/* ================= FALLBACK ================= */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================= EXPORT ================= */
module.exports = app;
