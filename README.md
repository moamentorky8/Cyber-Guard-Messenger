# 🛡️ Cyber Messenger | Secure RSA Messaging Terminal
**Developed by: Moamen Abdelfattah**

## 📖 Overview
Cyber Messenger is a high-security, cloud-native communication platform designed with a **Zero-Trust Architecture**. It ensures total privacy through end-to-end encryption, meaning only the intended recipient can decrypt and read the messages.

## 🔒 Security Features
* **Asynchronous RSA Encryption:** Utilizes 1024-bit RSA key pairs. The Private Key never leaves the user's device.
* **SHA-256 Password Hashing:** Credentials are securely hashed before being stored in the cloud.
* **Ephemeral Data:** Messages are automatically purged from the server after delivery to ensure data volatility.

## 🛠️ Tech Stack
* **Frontend:** HTML5, Tailwind CSS, JavaScript (Vanilla).
* **Backend:** Node.js, Express.js.
* **Database:** Firebase Realtime Database (Google Cloud).
* **Deployment:** Vercel (Serverless Functions).
* **Cryptography:** Node-Forge.

## 🚀 How it Works
1. **Key Generation:** Upon registration, the browser generates a unique RSA Key Pair.
2. **Key Exchange:** The Public Key is sent to Firebase, while the Private Key stays in LocalStorage.
3. **Encryption:** When Agent A sends a message to Agent B, the message is encrypted using Agent B's Public Key.
4. **Decryption:** Agent B receives the "Cyphertext" and uses their local Private Key to decrypt it.

---
*This project was developed for academic purposes to demonstrate advanced cryptographic integration in modern web applications.*
