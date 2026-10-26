// The signup profile (@profullstack/profile): /?mode=up asks for it, the
// register handler validates and stores it, /api/v1/me/profile serves it.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";

const here = dirname(fileURLToPath(import.meta.url));
const { db, get, isPostgres } = await import("../src/db.mjs");
const { sessionMiddleware } = await import("../src/lib/session.mjs");
const { authRouter } = await import("../src/routes/auth.mjs");
const { profileRouter } = await import("../src/lib/profile.mjs");

if (isPostgres) {
  await db.execute("DROP SCHEMA public CASCADE");
  await db.execute("CREATE SCHEMA public");
}
for (const file of ["001_auth.sql", "006_user_profiles.sql"]) {
  const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}

async function serve() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use(authRouter);
  app.use(profileRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    fetch: (path, init = {}) => fetch(`${base}${path}`, { redirect: "manual", ...init }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const form = (fields) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

test("the signup form asks for the profile; sign-in does not", async (t) => {
  const app = await serve();
  t.after(() => app.close());
  assert.match(await (await app.fetch("/?mode=up")).text(), /name="job_title"/);
  assert.doesNotMatch(await (await app.fetch("/?mode=in")).text(), /name="job_title"/);
});

test("a signup without a last name is refused and creates no account", async (t) => {
  const app = await serve();
  t.after(() => app.close());
  const res = await app.fetch("/auth/register", form({ email: "nolast@acme.com", password: "longenough1", first_name: "Ada" }));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /pfs-profile__error/);
  assert.equal(await get(`SELECT id FROM users WHERE email = ?`, ["nolast@acme.com"]), null);
});

test("a signup stores the six fields, normalized, and /api/v1/me/profile serves them", async (t) => {
  const app = await serve();
  t.after(() => app.close());
  const res = await app.fetch("/auth/register", form({
    email: "Ada@Acme.com",
    password: "longenough1",
    first_name: "Ada",
    last_name: "Lovelace",
    company_domain: "https://www.acme.com/about",
    job_title: "VP Engineering",
    linkedin_url: "in/ada-lovelace",
  }));
  assert.equal(res.status, 302);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const me = await app.fetch("/api/v1/me/profile", { headers: { cookie } });
  assert.equal(me.status, 200);
  const body = await me.json();
  const profile = body.profile ?? body;
  assert.equal(profile.email, "ada@acme.com");
  assert.equal(profile.first_name, "Ada");
  assert.equal(profile.last_name, "Lovelace");
  assert.equal(profile.company_domain, "acme.com");
  assert.equal(profile.job_title, "VP Engineering");
  assert.equal(profile.linkedin_url, "https://www.linkedin.com/in/ada-lovelace");

  const anon = await app.fetch("/api/v1/me/profile");
  assert.equal(anon.status, 401);
});
