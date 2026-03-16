const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path'); // لإدارة مسارات الملفات

const app = express();

// --- 1. الإعدادات الأساسية (Middlewares) ---
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); // قراءة فولدر public بشكل صحيح أونلاين

// --- 2. إعداد قاعدة البيانات (Database) ---
const db = new sqlite3.Database('./project.db', (err) => {
    if (err) console.error("خطأ في قاعدة البيانات:", err.message);
    else console.log("✅ متصل بقاعدة بيانات المشروع بنجاح");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        publicKey TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER,
        receiverId INTEGER,
        ciphertext TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- 3. دوال الحماية (Security Utilities) ---
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// --- 4. المسارات (Routes / APIs) ---

// الصفحة الرئيسية (عشان تفتح أول ما تدخل على اللينك)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تسجيل حساب جديد
app.post('/register', (req, res) => {
    const { username, password, publicKey } = req.body;
    const hashed = hashPassword(password);
    db.run("INSERT INTO users (username, password, publicKey) VALUES (?, ?, ?)", 
        [username, hashed, publicKey], (err) => {
        if (err) return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
        res.status(201).send("Registered");
    });
});

// تسجيل الدخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const hashed = hashPassword(password);
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, hashed], (err, row) => {
        if (err || !row) return res.status(401).json({ error: "بيانات خاطئة" });
        res.json({ id: row.id, username: row.username, publicKey: row.publicKey });
    });
});

// إعادة تعيين كلمة المرور
app.post('/reset-password', (req, res) => {
    const { username, password } = req.body;
    const newHashed = hashPassword(password);
    db.run("UPDATE users SET password = ? WHERE username = ?", [newHashed, username], function(err) {
        if (err || this.changes === 0) return res.status(404).send("User not found");
        res.send("Updated");
    });
});

// جلب قائمة المستخدمين
app.get('/users', (req, res) => {
    db.all("SELECT id, username, publicKey FROM users", (err, rows) => {
        if (err) return res.status(500).send(err);
        res.json(rows);
    });
});

// إرسال رسالة مشفرة
app.post('/send', (req, res) => {
    const { senderId, receiverId, ciphertext } = req.body;
    db.run("INSERT INTO messages (senderId, receiverId, ciphertext) VALUES (?, ?, ?)", 
        [senderId, receiverId, ciphertext], () => res.send("Sent"));
});

// جلب الرسائل المستلمة
app.get('/messages/:userId', (req, res) => {
    db.all("SELECT * FROM messages WHERE receiverId = ? ORDER BY timestamp DESC", 
        [req.params.userId], (err, rows) => res.json(rows));
});

// --- 5. تشغيل السيرفر (إعدادات النشر الأونلاين) ---
const PORT = process.env.PORT || 3000; // استخدام الـ Port الخاص بالسيرفر أو 3000 لوكال

app.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================");
    console.log(`🚀 السيرفر يعمل الآن بنجاح`);
    console.log(`🔗 الرابط المحلي: http://localhost:${PORT}`);
    console.log("بواسطة: مؤمن - جامعة برج العرب التكنولوجية");
    console.log("=========================================");
});