// Email/password auth + the sign-in page (which also hosts passkey + CoinPay buttons).
import { Router } from "express";
import { page, footer, esc } from "../lib/html.mjs";
import { csrfInput, createSession, destroySession, takeNext } from "../lib/session.mjs";
import { hashPassword, verifyPassword, id, token, sha256 } from "../lib/crypto.mjs";
import { createUserWithPassword, userByEmail } from "../lib/users.mjs";
import { get, run, batch } from "../db.mjs";
import { dashboardHandler } from "./pages.mjs";
import { config } from "../config.mjs";
import { ringFooter } from "../lib/ring-footer.mjs";
import { renderProfileFields, saveSignupProfile, validateProfile } from "@profullstack/profile";
import { profiles } from "../lib/profile.mjs";

// Asked for when creating an account, beside the email box; never on sign-in.
const SIGNUP_FIELDS = ["first_name", "last_name", "company_domain", "job_title", "linkedin_url"];

export const authRouter = Router();

function authPage(req, { error = "", notice = "", mode = "in", values = {}, errors = {} } = {}) {
  const isForgot = mode === "forgot";
  const isReset = mode === "reset" || mode === "recover";
  const isSignup = mode === "up";
  const action = isForgot ? "/auth/forgot" : mode === "recover" ? "/auth/recover" : isReset ? "/auth/reset" : isSignup ? "/auth/register" : "/auth/login";
  const body = `
  <main class="wrap" style="max-width:440px;padding-top:8vh">
    <a class="brand" href="/" style="justify-content:center;font-size:1.5rem;margin-bottom:6px"><span class="mark">LS</span>LogicSRC<span class="app">credentials</span></a>
    <p class="label" style="text-align:center;margin-bottom:26px">Share secrets, end-to-end encrypted</p>
    <div class="card"><div class="card-body">
      ${error ? `<div class="notice err">${esc(error)}</div>` : ""}
      ${notice ? `<div class="notice ok">${esc(notice)}</div>` : ""}
      <form method="post" action="${action}">
        ${csrfInput(req)}
        ${isReset ? `<input type="hidden" name="token" value="${esc(values.token ?? req.query.token ?? "")}">` : ""}
        <label class="field"><span>Email</span>
          <input type="email" name="email" autocomplete="username" ${isReset ? "readonly" : "required"} placeholder="you@example.com" value="${esc(values.email ?? req.query.email ?? "")}"></label>
        ${isSignup ? renderProfileFields({ fields: SIGNUP_FIELDS, values, errors, idPrefix: "signup-" }) : ""}
        ${isForgot ? "" : `<label class="field"><span>${isReset ? "New password" : "Password"}</span>
          <input type="password" name="password" autocomplete="${isSignup || isReset ? "new-password" : "current-password"}" required minlength="8" placeholder="8+ characters"></label>`}
        ${isReset ? `<label class="field"><span>Confirm new password</span><input type="password" name="password_confirmation" autocomplete="new-password" required minlength="8" placeholder="repeat password"></label>` : ""}
        <button class="btn acid block" type="submit">${isForgot ? "Email reset link" : isReset ? "Reset password" : isSignup ? "Create account" : "Sign in"}</button>
      </form>
      <p class="mono" style="text-align:center;font-size:.74rem;margin:14px 0 0">
        ${isForgot || isReset
          ? `<a class="acid" href="/?mode=in">Back to sign in</a>`
          : isSignup
          ? `Already have an account? <a class="acid" href="/?mode=in">Sign in</a>`
          : `New here? <a class="acid" href="/?mode=up">Create account</a>`}
      </p>

      ${mode === "in" ? `<p class="mono" style="text-align:center;font-size:.74rem;margin:8px 0 0"><a class="acid" href="/?mode=forgot">Forgot password?</a></p>` : ""}

      ${isForgot || isReset ? "" : `<div class="divider">or</div>`}

      ${isForgot || isReset ? "" : `<button class="btn block" type="button" id="passkey-btn" style="margin-bottom:10px">🔑 Continue with a passkey</button>
      ${config.coinpayLoginEnabled
        ? `<a class="btn block" href="/auth/coinpay/start">◆ Continue with CoinPay</a>`
        : `<button class="btn block" type="button" disabled title="Set COINPAY_OAUTH_* to enable">◆ Continue with CoinPay</button>`}
      <p id="passkey-msg" class="mono faint" style="font-size:.72rem;text-align:center;margin:12px 0 0"></p>`}
    </div></div>
  </main>${footer}${ringFooter()}
  ${isForgot || isReset ? "" : `<script src="/vendor/simplewebauthn-browser.umd.js"></script><script src="/passkey.js"></script>`}${isSignup ? `<script src="/vendor/profile-enhance.js" defer></script>` : ""}`;
  return page({ title: "LogicSRC ▸ sign in", body });
}

async function sendPasswordResetEmail(to, rawToken) {
  if (!config.resend.apiKey) return false;
  const url = `${config.origin}/auth/reset?token=${encodeURIComponent(rawToken)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.resend.from,
      to,
      subject: "Reset your LogicSRC password",
      text: `Someone requested a password reset for your LogicSRC account.\n\nReset it here: ${url}\n\nThis link expires in 30 minutes and can only be used once. If you did not request it, you can ignore this email.`,
    }),
  }).catch(() => null);
  return Boolean(response && response.ok);
}

authRouter.get("/", (req, res) => {
  if (req.user) {
    const next = takeNext(req, res);
    if (next) return res.redirect(next);
    return dashboardHandler(req, res); // dashboard lives at the root
  }
  res.type("html").send(authPage(req, {
    mode: req.query.mode === "up" ? "up" : req.query.mode === "forgot" ? "forgot" : "in",
    notice: req.query.reset === "1" ? "Password reset. You can sign in with your new password." : "",
  }));
});

authRouter.get("/auth/reset", async (req, res) => {
  const rawToken = String(req.query.token || "");
  const reset = rawToken ? await get(
    `SELECT u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`,
    [sha256(rawToken), Date.now()],
  ) : null;
  if (!reset) return res.type("html").send(authPage(req, { mode: "in", error: "That reset link is invalid or expired. Request a new one." }));
  res.type("html").send(authPage(req, { mode: "reset", values: { email: reset.email, token: rawToken } }));
});

authRouter.get("/auth/recover", async (req, res) => {
  const rawToken = String(req.query.token || "");
  const recovery = rawToken ? await get(
    `SELECT u.email FROM recovery_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > ?`,
    [sha256(rawToken), Date.now()],
  ) : null;
  if (!recovery) return res.type("html").send(authPage(req, { mode: "in", error: "That recovery token is invalid, revoked, or already used." }));
  res.type("html").send(authPage(req, { mode: "recover", values: { email: recovery.email, token: rawToken } }));
});

authRouter.post("/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  // What was typed comes back on a refused form (never the password).
  const values = Object.fromEntries(["email", ...SIGNUP_FIELDS].map((f) => [f, String(req.body[f] ?? "")]));
  const refuse = (error, errors = {}) => res.type("html").send(authPage(req, { mode: "up", error, values, errors }));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return refuse("Enter a valid email.");
  // The profile is checked before the account exists, so a refused form leaves nothing half-made.
  const check = validateProfile(req.body);
  if (!check.ok) return refuse("A few of those fields need another look.", check.errors);
  if (password.length < 8) return refuse("Password must be at least 8 characters.");
  if (await userByEmail(email)) return refuse("That email already has an account — sign in.");
  const user = await createUserWithPassword(email, hashPassword(password));
  // A failed profile write never fails the signup; Settings can fill it in.
  try {
    await saveSignupProfile(profiles, user.id, req.body, { email });
  } catch (e) {
    console.error("signup profile save failed:", e);
  }
  await createSession(res, user.id);
  res.redirect(takeNext(req, res) || "/");
});

authRouter.post("/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await userByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.type("html").send(authPage(req, { mode: "in", error: "Wrong email or password." }));
  }
  await createSession(res, user.id);
  res.redirect(takeNext(req, res) || "/");
});

authRouter.post("/auth/forgot", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? await userByEmail(email) : null;
  if (user) {
    const rawToken = token(32);
    await run(`DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?`, [user.id, Date.now()]);
    await run(`INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?,?,?,?,?)`,
      [id(), user.id, sha256(rawToken), Date.now(), Date.now() + 1000 * 60 * 30]);
    await sendPasswordResetEmail(email, rawToken);
  }
  res.type("html").send(authPage(req, {
    mode: "forgot",
    values: { email },
    notice: "If an account exists for that email, a reset link is on its way.",
  }));
});

authRouter.post("/auth/reset", async (req, res) => {
  const rawToken = String(req.body.token || "");
  const password = String(req.body.password || "");
  const confirmation = String(req.body.password_confirmation || "");
  const reset = rawToken ? await get(
    `SELECT r.id, r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`,
    [sha256(rawToken), Date.now()],
  ) : null;
  if (!reset) return res.type("html").send(authPage(req, { mode: "in", error: "That reset link is invalid or expired. Request a new one." }));
  if (password.length < 8) return res.type("html").send(authPage(req, { mode: "reset", error: "Password must be at least 8 characters.", values: { email: reset.email, token: rawToken } }));
  if (password !== confirmation) return res.type("html").send(authPage(req, { mode: "reset", error: "Passwords do not match.", values: { email: reset.email, token: rawToken } }));
  const now = Date.now();
  await batch([
    { sql: `UPDATE users SET password_hash = ? WHERE id = ?`, args: [hashPassword(password), reset.user_id] },
    { sql: `UPDATE password_resets SET used_at = ? WHERE id = ?`, args: [now, reset.id] },
    { sql: `DELETE FROM sessions WHERE user_id = ?`, args: [reset.user_id] },
  ]);
  res.redirect("/?reset=1");
});

authRouter.post("/auth/recover", async (req, res) => {
  const rawToken = String(req.body.token || "");
  const password = String(req.body.password || "");
  const confirmation = String(req.body.password_confirmation || "");
  const recovery = rawToken ? await get(
    `SELECT r.id, r.user_id, u.email FROM recovery_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > ?`,
    [sha256(rawToken), Date.now()],
  ) : null;
  if (!recovery) return res.type("html").send(authPage(req, { mode: "in", error: "That recovery token is invalid, revoked, or already used." }));
  if (password.length < 8) return res.type("html").send(authPage(req, { mode: "recover", error: "Password must be at least 8 characters.", values: { email: recovery.email, token: rawToken } }));
  if (password !== confirmation) return res.type("html").send(authPage(req, { mode: "recover", error: "Passwords do not match.", values: { email: recovery.email, token: rawToken } }));
  const now = Date.now();
  await batch([
    { sql: `UPDATE users SET password_hash = ? WHERE id = ?`, args: [hashPassword(password), recovery.user_id] },
    { sql: `UPDATE recovery_tokens SET used_at = ? WHERE id = ?`, args: [now, recovery.id] },
    { sql: `DELETE FROM sessions WHERE user_id = ?`, args: [recovery.user_id] },
  ]);
  res.redirect("/?reset=1");
});

authRouter.post("/auth/logout", async (req, res) => {
  await destroySession(req, res);
  res.redirect("/");
});
