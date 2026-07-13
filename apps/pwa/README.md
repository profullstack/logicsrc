# @logicsrc/pwa — LogicSRC credentials

Express + libSQL/Turso app for **team credential sharing**: auth (email/password,
passkeys, CoinPay OAuth, sessions, `lsk_` CLI API keys) + end-to-end-encrypted
team vaults. Zero-knowledge — the server only stores ciphertext, per-member
sealed vault keys, and identity public keys. Decryption happens in the
`logicsrc` CLI.

```bash
cp .env.example .env      # set SESSION_SECRET; TURSO_* for prod (else local file db)
npm install
npm start                 # migrates on boot, serves on :8080
```

The CLI connects with `LOGICSRC_API=<origin> logicsrc login` (browser OAuth-PKCE
loopback → an `lsk_` key). See `docs/credential-sharing.md` in the repo root.
