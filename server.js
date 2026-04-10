const express = require("express");
const crypto = require("crypto");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
const SESSION_COOKIE = "cg_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ONLINE_WINDOW_MS = 1000 * 60;
const sessionSecret =
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
let usingMemoryDb = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readPath(store, pathValue) {
    if (!pathValue) {
        return store;
    }

    const keys = pathValue.split("/").filter(Boolean);
    let current = store;
    for (const key of keys) {
        if (current == null || typeof current !== "object" || !(key in current)) {
            return null;
        }
        current = current[key];
    }

    return current;
}

function writePath(store, pathValue, value) {
    const keys = pathValue.split("/").filter(Boolean);
    let current = store;

    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!current[key] || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key];
    }

    current[keys[keys.length - 1]] = value;
}

function createMemoryDb() {
    const store = {};
    let idCounter = 0;

    function createRef(pathValue) {
        return {
            async once() {
                const value = clone(readPath(store, pathValue));
                return {
                    val: () => value,
                    exists: () => value !== null && value !== undefined,
                };
            },
            async set(value) {
                writePath(store, pathValue, clone(value));
            },
            async update(value) {
                const current = readPath(store, pathValue);
                const nextValue =
                    current && typeof current === "object"
                        ? { ...current, ...clone(value) }
                        : { ...clone(value) };
                writePath(store, pathValue, nextValue);
            },
            push() {
                idCounter += 1;
                return createRef(
                    [pathValue, `local_${Date.now()}_${idCounter}`].filter(Boolean).join("/")
                );
            },
        };
    }

    return {
        ref(pathValue) {
            return createRef(pathValue);
        },
    };
}

if (!admin.apps.length) {
    try {
        let serviceAccount;

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            serviceAccount = JSON.parse(rawJson);

            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
            }
        } else {
            serviceAccount = require("./serviceAccountKey.json");
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL:
                "https://cyber-massage-default-rtdb.europe-west1.firebasedatabase.app",
        });
    } catch (error) {
        console.error("Firebase initialization failed:", error.message);
    }
}

const db = admin.apps.length ? admin.database() : createMemoryDb();
usingMemoryDb = !admin.apps.length;

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt:${salt}:${derived}`;
}

function legacyHash(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password, storedHash) {
    if (!storedHash) {
        return false;
    }

    if (storedHash.startsWith("scrypt:")) {
        const [, salt, expectedHash] = storedHash.split(":");
        if (!salt || !expectedHash) {
            return false;
        }

        const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
        return crypto.timingSafeEqual(
            Buffer.from(actualHash, "hex"),
            Buffer.from(expectedHash, "hex")
        );
    }

    return legacyHash(password) === storedHash;
}

function createSessionToken(username) {
    const issuedAt = Date.now().toString();
    const payload = `${username}:${issuedAt}`;
    const signature = crypto
        .createHmac("sha256", sessionSecret)
        .update(payload)
        .digest("hex");

    return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

function parseCookies(req) {
    const header = req.headers.cookie || "";
    return header.split(";").reduce((acc, part) => {
        const [key, ...rest] = part.trim().split("=");
        if (!key) {
            return acc;
        }

        acc[key] = decodeURIComponent(rest.join("=") || "");
        return acc;
    }, {});
}

function readSession(req) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) {
        return null;
    }

    try {
        const decoded = Buffer.from(token, "base64url").toString("utf8");
        const [username, issuedAt, signature] = decoded.split(":");
        if (!username || !issuedAt || !signature) {
            return null;
        }

        const payload = `${username}:${issuedAt}`;
        const expected = crypto
            .createHmac("sha256", sessionSecret)
            .update(payload)
            .digest("hex");

        if (
            !crypto.timingSafeEqual(
                Buffer.from(signature, "hex"),
                Buffer.from(expected, "hex")
            )
        ) {
            return null;
        }

        if (Date.now() - Number(issuedAt) > SESSION_TTL_MS) {
            return null;
        }

        return { username };
    } catch (error) {
        return null;
    }
}

function setSessionCookie(res, username) {
    const token = createSessionToken(username);
    const isProduction = process.env.NODE_ENV === "production";
    const parts = [
        `${SESSION_COOKIE}=${token}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];

    if (isProduction) {
        parts.push("Secure");
    }

    res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
}

function requireAuth(req, res, next) {
    const session = readSession(req);
    if (!session) {
        return res.status(401).json({ error: "Authentication required" });
    }

    req.auth = session;
    return next();
}

function normalizeUsername(value) {
    return String(value || "").toLowerCase().trim();
}

function sanitizeHandle(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

async function getUserByUsername(username) {
    const snapshot = await db.ref(`users/${username}`).once("value");
    return snapshot.val();
}

app.post("/register", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");
        const publicKey = String(req.body.publicKey || "").trim();

        if (!username || !password || !publicKey) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const userRef = db.ref(`users/${username}`);
        const snapshot = await userRef.once("value");
        if (snapshot.exists()) {
            return res.status(400).json({ error: "Username already exists" });
        }

        await userRef.set({
            username,
            password: hashPassword(password),
            publicKey,
            handle: "",
            lastSeen: Date.now(),
        });

        setSessionCookie(res, username);
        return res.status(201).json({ username, handle: "", publicKey });
    } catch (error) {
        return res.status(500).json({ error: "Server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");
        const publicKey = String(req.body.publicKey || "").trim();

        if (!username || !password) {
            return res.status(400).json({ error: "Missing credentials" });
        }

        const userRef = db.ref(`users/${username}`);
        const user = await getUserByUsername(username);

        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (user.publicKey && publicKey && user.publicKey !== publicKey) {
            return res.status(409).json({
                error:
                    "Stored encryption keys do not match this device. Restore your local keys or reset your identity.",
            });
        }

        const updates = { lastSeen: Date.now() };
        if (!String(user.password).startsWith("scrypt:")) {
            updates.password = hashPassword(password);
        }
        if (!user.publicKey && publicKey) {
            updates.publicKey = publicKey;
        }

        await userRef.update(updates);
        setSessionCookie(res, username);

        return res.json({
            username: user.username,
            handle: user.handle || "",
            publicKey: user.publicKey || publicKey,
        });
    } catch (error) {
        return res.status(500).json({ error: "Login failed" });
    }
});

app.post("/logout", (_req, res) => {
    clearSessionCookie(res);
    return res.json({ success: true });
});

app.get("/me", requireAuth, async (req, res) => {
    try {
        const user = await getUserByUsername(req.auth.username);
        if (!user) {
            clearSessionCookie(res);
            return res.status(404).json({ error: "User not found" });
        }

        await db.ref(`users/${req.auth.username}`).update({ lastSeen: Date.now() });
        return res.json({
            username: user.username,
            handle: user.handle || "",
            publicKey: user.publicKey || "",
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to load profile" });
    }
});

app.post("/set-handle", requireAuth, async (req, res) => {
    try {
        const handle = sanitizeHandle(req.body.handle);
        if (!handle) {
            return res.status(400).json({ error: "Handle is required" });
        }

        await db.ref(`users/${req.auth.username}`).update({
            handle,
            lastSeen: Date.now(),
        });

        return res.json({ success: true, handle });
    } catch (error) {
        return res.status(500).json({ error: "Failed to update handle" });
    }
});

app.post("/reset-password", requireAuth, async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || "");
        const newPassword = String(req.body.newPassword || "");
        const requestedUsername = normalizeUsername(req.body.username);

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current and new passwords are required" });
        }

        if (requestedUsername && requestedUsername !== req.auth.username) {
            return res.status(403).json({ error: "You can only update your own account" });
        }

        const user = await getUserByUsername(req.auth.username);
        if (!user || !verifyPassword(currentPassword, user.password)) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        await db.ref(`users/${req.auth.username}`).update({
            password: hashPassword(newPassword),
            lastSeen: Date.now(),
        });

        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Password reset failed" });
    }
});

app.get("/users", requireAuth, async (req, res) => {
    try {
        const search = normalizeUsername(req.query.search);
        const snapshot = await db.ref("users").once("value");
        const usersData = snapshot.val() || {};

        const usersList = Object.values(usersData)
            .filter((user) => {
                if (user.username === req.auth.username) {
                    return false;
                }

                const handle = String(user.handle || "").toLowerCase();
                return (
                    !search ||
                    String(user.username || "").includes(search) ||
                    handle.includes(search)
                );
            })
            .map((user) => ({
                username: user.username,
                handle: user.handle || "",
                publicKey: user.publicKey || "",
                status:
                    Date.now() - Number(user.lastSeen || 0) < ONLINE_WINDOW_MS
                        ? "online"
                        : "offline",
            }));

        return res.json(usersList);
    } catch (error) {
        return res.json([]);
    }
});

app.post("/send", requireAuth, async (req, res) => {
    try {
        const receiver = normalizeUsername(req.body.receiver);
        const message = String(req.body.message || "").trim();
        const senderCopy = String(req.body.senderCopy || "").trim();

        if (!receiver || !message || !senderCopy) {
            return res
                .status(400)
                .json({ error: "Receiver message and sender copy are required" });
        }

        const receiverUser = await getUserByUsername(receiver);
        if (!receiverUser) {
            return res.status(404).json({ error: "Receiver not found" });
        }

        const msgRef = db.ref("messages").push();
        await msgRef.set({
            sender: req.auth.username,
            receiver,
            message,
            senderCopy,
            timestamp: Date.now(),
        });

        await db.ref(`users/${req.auth.username}`).update({ lastSeen: Date.now() });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Failed to send message" });
    }
});

app.get("/messages", requireAuth, async (req, res) => {
    try {
        const snapshot = await db.ref("messages").once("value");
        const allMessages = snapshot.val() || {};

        const myMessages = Object.values(allMessages)
            .filter(
                (message) =>
                    message.receiver === req.auth.username ||
                    message.sender === req.auth.username
            )
            .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

        await db.ref(`users/${req.auth.username}`).update({ lastSeen: Date.now() });
        return res.json(myMessages);
    } catch (error) {
        return res.json([]);
    }
});

app.get("/reset", (_req, res) =>
    res.sendFile(path.join(__dirname, "public", "public", "reset.html"))
);

app.get("*", (_req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html"))
);

module.exports = app;

if (process.env.NODE_ENV !== "production") {
    app.listen(3000, () => {
        console.log("Security server running on port 3000");
        if (usingMemoryDb) {
            console.log("Firebase credentials not found. Running with in-memory demo data.");
        }
    });
}
