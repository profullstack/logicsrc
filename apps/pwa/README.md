# @logicsrc/pwa — LogicSRC credentials

Express app on Postgres for **team credential sharing**: auth (email/password,
passkeys, CoinPay OAuth, sessions, `lsk_` CLI API keys) + end-to-end-encrypted
team vaults. Zero-knowledge — the server only stores ciphertext, per-member
sealed vault keys, and identity public keys. Decryption happens in the
`logicsrc` CLI.

```bash
cp .env.example .env      # set SESSION_SECRET; DATABASE_URL=postgres://… for prod (else a local libSQL file db)
npm install
npm start                 # migrates on boot, serves on :8080
```

## Database

Production runs on Postgres: `DATABASE_URL` must be a `postgres://` URL and the
app refuses to start on anything else there (a leftover `libsql://` value is
called out by name). The client is
[`@profullstack/libsql-pg`](https://github.com/profullstack/libsql-pg), which
keeps the `@libsql/client` surface the code was written against and rewrites
the remaining SQLite idioms per statement. Development and the tests use libSQL
itself (`file:./data/local.db` by default, `:memory:` in tests).

Migrations run at boot and live in two dialect copies with the same file names:
`src/migrations/` (SQLite) and `src/migrations-pg/` (Postgres, generated with
`npx libsql-pg convert-schema` and reviewed). `npm run migrate` applies the copy
matching `DATABASE_URL`. To move an existing Turso database:

```bash
DATABASE_URL=postgres://… npm run migrate                                   # schema
npx libsql-pg copy --from "$TURSO_DATABASE_URL" --token "$TURSO_AUTH_TOKEN" \
  --to "$DATABASE_URL" --verify                                             # rows
```

Set `PWA_TEST_DATABASE_URL=postgres://…` to run the test suite against a real
Postgres (it drops and recreates the `public` schema of that database).

The CLI connects with `LOGICSRC_API=<origin> logicsrc login` (browser OAuth-PKCE
loopback → an `lsk_` key). See `docs/credential-sharing.md` in the repo root.
