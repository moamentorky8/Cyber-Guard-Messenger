# Cyber Messenger

Cyber Messenger is a browser-based secure messaging demo built around client-side RSA encryption, Firebase Realtime Database, and a lightweight Express backend. The application is designed to keep private keys on the user's device while the server stores only encrypted message payloads and user metadata.

## Highlights

- Client-side RSA key generation and local private key ownership
- Public-key message encryption before data reaches Firebase
- Signed session cookie protection for authenticated routes
- Searchable user discovery by username or handle
- Full conversation history with sender-side encrypted copies
- Password reset flow tied to an authenticated session

## How It Works

1. A user registers with a username, password, and browser-generated public key.
2. The private key is stored locally in the browser and is never uploaded to the server.
3. When sending a message, the client encrypts:
   - one copy with the receiver's public key
   - one copy with the sender's own public key for local history
4. The backend stores encrypted payloads in Firebase Realtime Database.
5. On message retrieval, the browser decrypts the appropriate copy using the locally stored private key.

## Architecture

### Frontend

- Vanilla HTML, CSS, and JavaScript
- Tailwind via CDN for utility styling
- Node-Forge for RSA key generation and encryption

### Backend

- Node.js + Express
- Firebase Admin SDK
- Signed cookie-based session validation

### Data Store

- Firebase Realtime Database for:
  - user records
  - encrypted messages
  - presence metadata such as `lastSeen`

## Current Functionality

- Register a new user
- Log in with an existing account
- Persist encryption keys locally per user on the same device
- Set and update a public handle
- Search for other users
- Send encrypted messages
- View complete two-way conversation history
- Reset password from an active authenticated session
- Restore active session on page reload when the session cookie is still valid

## Firebase Compatibility Notes

The recent code changes remain compatible with the current Firebase structure and should not break the existing database layout.

### What stayed compatible

- `users/{username}` is still the main user record path
- `messages` is still the main collection for stored messages
- Existing fields such as `username`, `handle`, `publicKey`, and `lastSeen` are still used
- Existing messages remain readable as long as the user still has the original local private key on the same device

### What changed

- Passwords are now stored using `scrypt` instead of plain SHA-256 for stronger protection
- Legacy SHA-256 passwords are still accepted during login and are upgraded automatically after a successful sign-in
- Message writes now require both:
  - `message` for the receiver
  - `senderCopy` for the sender's own history

### Practical impact

- Existing Firebase data should continue to work
- Existing users can still log in with their current passwords
- Their password hash format will be upgraded transparently after login
- Old messages that were stored without `senderCopy` will still exist, but older sent-message history may not render perfectly until new messages are sent using the updated flow

## Known Limitations

- If browser local storage is cleared, previously received messages on that device may become undecryptable
- Messages are retained in Firebase and are not automatically deleted
- The app uses a lightweight custom session implementation and is still best treated as a demo or academic project, not a production-grade messenger
- Session continuity across server restarts is strongest when `SESSION_SECRET` is explicitly configured

## Environment Variables

### Required

- `FIREBASE_SERVICE_ACCOUNT`
  JSON service account credentials for Firebase Admin SDK

### Recommended

- `SESSION_SECRET`
  Used to sign session cookies consistently across restarts and deployments

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Provide Firebase credentials using one of these options:
   - set `FIREBASE_SERVICE_ACCOUNT` as a JSON string
   - or place `serviceAccountKey.json` in the project root

3. Optionally define a stable session secret:

   ```bash
   SESSION_SECRET=your-secret
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open the app in the browser:

   ```text
   http://localhost:3000
   ```

## Important Security Notes

- Private keys are intentionally stored only on the client side
- Losing local keys means losing the ability to decrypt older messages on that device
- The backend protects routes with signed cookies, but this implementation is still intentionally simple
- For production use, consider adding:
  - stronger session storage
  - CSRF protection
  - rate limiting
  - audit logging
  - key backup or device recovery strategy

## Project Status

This project is now in a much safer and more coherent state than the original version, especially around authentication, history rendering, and password handling. It is still a secure messaging demo rather than a hardened production platform.
