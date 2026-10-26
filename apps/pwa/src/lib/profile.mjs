// The signup profile (@profullstack/profile): email, first/last name, company
// domain, job title, LinkedIn URL, in user_profiles keyed by users.id.
//
//   profiles                 the store, on the app's own client
//   profileRouter            GET/PUT/PATCH /api/v1/me/profile (session cookie)
//
// The package's handlers speak Web Request/Response; Express has already parsed
// the body, so it is handed back to them as JSON.
import { Router } from "express";
import { createProfileHandlers, createProfileStore } from "@profullstack/profile";
import { db } from "../db.mjs";

export const profiles = createProfileStore(db);

const handlers = createProfileHandlers({
  store: profiles,
  // Only a browser session: this is a person's own details.
  getUser: (_request, req) => (req.user ? { id: req.user.id, email: req.user.email || null } : null),
});

function toRequest(req) {
  const hasBody = !["GET", "HEAD"].includes(req.method);
  return new Request(`http://localhost${req.originalUrl}`, {
    method: req.method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });
}

async function send(res, response) {
  res.status(response.status);
  response.headers.forEach((value, key) => res.set(key, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}

export const profileRouter = Router();
for (const method of ["GET", "PUT", "PATCH"]) {
  profileRouter[method.toLowerCase()]("/api/v1/me/profile", async (req, res, next) => {
    try {
      await send(res, await handlers[method](toRequest(req), req));
    } catch (e) {
      next(e);
    }
  });
}
