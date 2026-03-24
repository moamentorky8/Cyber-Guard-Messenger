const express = require('express');
const crypto = require('crypto');
const path = require('path');
const admin = require("firebase-admin");

/**
 * CYBER MESSENGER - SERVER CORE ARCHITECTURE
 * Developer: Moamen Abdelfattah
 * Platform: Node.js + Firebase Realtime Database
 */

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Firebase Secure Admin SDK
if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
            : require("./serviceAccountKey.json");
            
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app"
        });
        console.log("%c[FIREBASE]: Connection Established Successfully", "color: #22c55e; font-weight: bold;");
    } catch (e) { 
        console.error("[CRITICAL ERROR]: Firebase Admin Init Failed ->", e.message); 
    }
}

const db = admin.database();
const generateSHA256 = (plainText) => crypto.createHash('sha256').update(plainText).digest('hex');

// --- IDENTITY & AUTHENTICATION PROTOCOLS ---

// 1. Register New Node
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey } = req.body;
        const u = username.toLowerCase().trim();
        const userRef = db.ref(`users/${u}`);
        
        const check = await userRef.once("value");
        if (check.exists()) return res.status(400).json({ error: "Agent ID Conflict: Node already exists" });

        const userData = {
            username: u,
            password: generateSHA256(password),
            publicKey: publicKey,
            lastSeen: Date.now(),
            handle: u, // Default handle same as username
            status: 'online'
        };

        await userRef.set(userData);
        res.status(201).json({ success: true, username: u });
    } catch (err) { res.status(500).json({ error: "Internal Encryption Error" }); }
});

// 2. Authorize Identity (Login)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const u = username.toLowerCase().trim();
        const snap = await db.ref(`users/${u}`).once("value");
        const user = snap.val();

        if (!user || user.password !== generateSHA256(password)) {
            return res.status(401).json({ error: "Unauthorized: Invalid Cipher Key (Password)" });
        }

        await db.ref(`users/${u}`).update({ lastSeen: Date.now(), status: 'online' });
        res.json({ username: u, publicKey: user.publicKey, handle: user.handle || u });
    } catch (err) { res.status(500).json({ error: "Auth Service Timeout" }); }
});

// 3. Live Key Synchronization (Fixes [Cipher Error])
app.post('/update-key', async (req, res) => {
    try {
        const { username, publicKey } = req.body;
        const u = username.toLowerCase().trim();
        await db.ref(`users/${u}`).update({ publicKey: publicKey });
        res.json({ success: true, status: "Public Key Synchronized" });
    } catch (err) { res.status(500).json({ error: "Key Sync Failed" }); }
});

// 4. Identity Override (Reset Password)
app.post('/reset-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const u = username.toLowerCase().trim();
        const ref = db.ref(`users/${u}`);
        const snap = await ref.once("value");
        
        if (!snap.exists()) return res.status(404).json({ error: "Node ID Not Found" });
        
        await ref.update({ password: generateSHA256(newPassword) });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database Write Failure" }); }
});

// --- NODE DISCOVERY & DATA RETRIEVAL ---

// 5. Fetch Global Directory
app.get('/users', async (req, res) => {
    try {
        const snap = await db.ref("users").once("value");
        const data = snap.val() || {};
        const usersList = Object.values(data).map(u => ({
            username: u.username,
            handle: u.handle || u.username,
            publicKey: u.publicKey,
            status: (Date.now() - u.lastSeen < 120000) ? "online" : "offline"
        }));
        res.json(usersList);
    } catch (err) { res.status(500).send("Directory Unreachable"); }
});

// 6. Finalize Identity Handle (Setup Handle)
app.post('/add-member', async (req, res) => {
    try {
        const { username, handle } = req.body;
        await db.ref(`users/${username.toLowerCase().trim()}`).update({ 
            handle: handle.toLowerCase().trim() 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
});

// --- MESSAGING ENGINE (RSA-OAEP PAYLOADS) ---

// 7. Dispatch Private Packet
app.post('/send', async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        const msgRef = db.ref("messages").push();
        const payload = {
            id: msgRef.key,
            sender,
            receiver: receiver.toLowerCase().trim(),
            message,
            timestamp: Date.now()
        };
        await msgRef.set(payload);
        res.json({ success: true, packetID: msgRef.key });
    } catch (err) { res.status(500).send(); }
});

// 8. Fetch Incoming Transmissions (Inbox Mode)
app.get('/messages/:username', async (req, res) => {
    try {
        const u = req.params.username.toLowerCase().trim();
        const snap = await db.ref("messages").orderByChild("receiver").equalTo(u).limitToLast(50).once("value");
        const msgs = snap.val() || {};
        res.json(Object.values(msgs).sort((a,b) => b.timestamp - a.timestamp));
    } catch (err) { res.status(500).send(); }
});

// 9. Fetch Full Private Link (History Mode)
app.get('/messages-full/:u1/:u2', async (req, res) => {
    try {
        const { u1, u2 } = req.params;
        const snap = await db.ref("messages").once("value");
        const all = snap.val() || {};
        const filtered = Object.values(all).filter(m => 
            (m.sender === u1 && m.receiver === u2) || (m.sender === u2 && m.receiver === u1)
        ).sort((a,b) => a.timestamp - b.timestamp);
        res.json(filtered);
    } catch (err) { res.status(500).send(); }
});

// --- SECURE SECTOR (GROUPS) ENGINE ---

// 10. Deploy Secure Sector
app.post('/create-group', async (req, res) => {
    const { groupName, creator } = req.body;
    const ref = db.ref("groups").push();
    await ref.set({
        name: groupName,
        creator: creator,
        members: { [creator]: true },
        created: Date.now()
    });
    res.json({ success: true, groupId: ref.key });
});

// 11. Authorize Node in Sector by Handle (@nickname)
app.post('/add-member-by-handle', async (req, res) => {
    try {
        const { groupId, handle } = req.body;
        const h = handle.toLowerCase().trim();
        const userSnap = await db.ref("users").orderByChild("handle").equalTo(h).once("value");
        
        if (!userSnap.exists()) return res.status(404).json({ error: "Node @nickname not found in directory" });
        
        const userKey = Object.keys(userSnap.val())[0];
        await db.ref(`groups/${groupId}/members/${userKey}`).set(true);
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
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
    const msgRef = db.ref(`groups/${req.body.groupId}/messages`).push();
    await msgRef.set({ id: msgRef.key, sender: req.body.sender, message: req.body.message, timestamp: Date.now() });
    res.json({ success: true });
});

app.get('/group-messages/:groupId', async (req, res) => {
    const snap = await db.ref(`groups/${req.params.groupId}/messages`).once("value");
    const msgs = snap.val() || {};
    res.json(Object.values(msgs).sort((a,b) => a.timestamp - b.timestamp));
});

// --- PAYLOAD MODIFICATION PROTOCOLS (EDIT/DELETE) ---

// 12. Modify Payload (Edit)
app.post('/edit-message', async (req, res) => {
    try {
        const { msgId, newVal, sender } = req.body;
        const ref = db.ref(`messages/${msgId}`);
        const snap = await ref.once("value");
        
        if (snap.exists() && snap.val().sender === sender) {
            await ref.update({ message: newVal, edited: true });
            return res.json({ success: true });
        }
        res.status(403).json({ error: "Modification Refused: Permission Denied" });
    } catch (err) { res.status(500).send(); }
});

// 13. Void Payload (Delete)
app.post('/delete-message', async (req, res) => {
    try {
        const { msgId, sender } = req.body;
        const ref = db.ref(`messages/${msgId}`);
        const snap = await ref.once("value");
        
        if (snap.exists() && snap.val().sender === sender) {
            await ref.remove();
            return res.json({ success: true });
        }
        res.status(403).send();
    } catch (err) { res.status(500).send(); }
});

// 14. Terminate Secure Sector
app.post('/delete-group', async (req, res) => {
    const { groupId, username } = req.body;
    const ref = db.ref(`groups/${groupId}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val().creator === username) {
        await ref.remove();
        res.json({ success: true });
    } else res.status(403).json({ error: "Termination Denied" });
});

// Catch-all to serve UI
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[CYBER-OS]: Intelligence Terminal Active on Port ${PORT}`));

module.exports = app;
