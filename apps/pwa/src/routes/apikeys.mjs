// API keys as an API: list, mint and revoke the caller's own lsk_ keys.
//
//   GET    /api/keys          the caller's keys (never a hash, never a secret)
//   POST   /api/keys          mint one; the plaintext is in this response only
//   DELETE /api/keys/:id      revoke (delete) one, with its vault grants
//
// Auth: a browser session or a person's (`user`) key. A machine key cannot
// mint keys, list them or revoke them: a deploy box that could make itself a
// broader credential would make the scoping pointless.
import { Router } from "express";
import {
  ApiKeyError,
  bearer,
  createApiKey,
  keyForBearer,
  keyJson,
  listApiKeys,
  machineKeyOptions,
  revokeApiKey
} from "../lib/apikey.mjs";

export const apiKeysRouter = Router();

function personOnly(handler) {
  return async (req, res) => {
    let user = req.user;
    let key = null;
    if (!user) {
      const found = await keyForBearer(bearer(req));
      if (!found) return res.status(401).json({ error: "Not authenticated, or the API key is revoked or expired. Run: logicsrc login" });
      ({ user, key } = found);
    }
    if (key?.kind === "machine") {
      return res.status(403).json({ error: "A machine API key cannot manage API keys.", code: "machine_key_forbidden" });
    }
    try {
      await handler(req, res, user);
    } catch (e) {
      if (e instanceof ApiKeyError) return res.status(e.status).json({ error: e.message });
      console.error("apikeys:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}

apiKeysRouter.get("/api/keys", personOnly(async (_req, res, user) => {
  res.json({ keys: (await listApiKeys(user.id)).map(keyJson) });
}));

apiKeysRouter.post("/api/keys", personOnly(async (req, res, user) => {
  const body = req.body || {};
  const name = String(body.name || "").trim().slice(0, 40);
  if (!name) return res.status(422).json({ error: "Give the key a name (e.g. dev2-deploy)." });
  const kind = body.kind === undefined ? "user" : String(body.kind);
  if (kind !== "user" && kind !== "machine") return res.status(422).json({ error: 'kind must be "user" or "machine".' });

  const opts = kind === "machine"
    ? await machineKeyOptions(user.id, { team: body.team, vaults: body.vaults, readOnly: body.readOnly, expires: body.expiresAt ?? body.expires })
    : {};
  const { plaintext, row } = await createApiKey(user.id, name, opts);
  const listed = (await listApiKeys(user.id)).find((k) => k.id === row.id);
  res.status(201).json({ key: keyJson(listed), secret: plaintext });
}));

apiKeysRouter.delete("/api/keys/:id", personOnly(async (req, res, user) => {
  const ok = await revokeApiKey(user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "No such API key on your account." });
  res.json({ ok: true, revoked: req.params.id });
}));
