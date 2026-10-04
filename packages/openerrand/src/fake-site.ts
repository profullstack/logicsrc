/**
 * A tiny fake MyFTB for the integration test: Terms, Profile, a
 * proof-of-work interstitial that clears itself, Business, Phone, Code and
 * Confirmation, served over HTTPS with a throwaway self-signed certificate.
 * Chrome reaches it as https://webapp.ftb.ca.gov through
 * `--host-resolver-rules`, with every other hostname mapped to NOTFOUND, so
 * the test runs the published example file unchanged and cannot reach the
 * real site. Every value it checks is fictional (Jane Doe, corporation
 * 1234567).
 *
 * Not part of the build.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FAKE = {
  firstName: "Jane",
  lastName: "Doe",
  zip: "95814",
  addressNumbers: "1234",
  corpId: "1234567",
  netIncome: "48210",
  year: "2025",
  phone: "5555550100",
  code: "482913",
} as const;

export interface FakeSite {
  port: number;
  /** Every request: method, path and user agent. */
  requests: Array<{ method: string; path: string; userAgent: string }>;
  /** Called on GET /Code and on a wrong code, so the test can relay the next code. */
  onCode: (attempt: number) => void;
  posted: Record<string, Record<string, string>>;
  close(): Promise<void>;
}

const page = (title: string, body: string, error = ""): string => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>
<header>Franchise Tax Board e-Services</header>
<main><h1>${title.replace(/^.*\| /, "")}</h1>
${error ? `<div class="alert-danger" role="alert">${error}</div>` : ""}
${body}
</main></body></html>`;

const form = (action: string, inner: string, buttons = '<button type="button">Back</button> <button type="submit">Continue</button>'): string =>
  `<form method="post" action="${action}">${inner}<div class="buttons">${buttons}</div></form>`;

const input = (id: string, label: string, type = "text", required = true): string =>
  `<div class="form-group"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}"${required ? " required" : ""}></div>`;

const select = (id: string, label: string, options: string[], required = true): string =>
  `<div class="form-group"><label for="${id}">${label}</label><select id="${id}" name="${id}"${required ? " required" : ""}><option value="">Select</option>${options.map((o) => `<option value="${o}">${o}</option>`).join("")}</select></div>`;

const QUESTIONS = ["What was the name of your first pet?", "What city were you born in?", "What was your first car?", "What was the name of your elementary school?"];

const PAGES = {
  terms: () =>
    page(
      "Registration | Terms",
      form(
        "/MyFTBAccess/Registration/NewAccount",
        `<p>Terms of use.</p>
<div class="form-group"><input id="ReadTerms" name="ReadTerms" type="checkbox" value="true" required><label for="ReadTerms">I have read the terms of use</label></div>
<div class="form-group"><input id="AcceptTerms" name="AcceptTerms" type="checkbox" value="true" required><label for="AcceptTerms">I accept the terms of use</label></div>`,
      ),
    ),
  profile: (error = "") =>
    page(
      "Registration | Profile",
      form(
        "/MyFTBAccess/Registration/Profile",
        [
          input("FstName", "First Name"),
          input("MInitial", "Middle Initial", "text", false),
          input("LstName", "Last Name"),
          input("UserName", "User Name"),
          input("ReUserName", "Confirm User Name"),
          input("Email", "Email Address", "email"),
          input("ReEmail", "Confirm Email Address", "email"),
          input("Password", "Password", "password"),
          input("RePassword", "Confirm Password", "password"),
          ...[1, 2, 3].flatMap((n) => [select(`SecQ${n}`, `Security Question ${n}`, QUESTIONS), input(`SecA${n}`, `Answer ${n}`)]),
        ].join("\n"),
      ),
      error,
    ),
  challenge: () => `<!doctype html><html><head><title>Challenge Validation</title></head><body>
<div id="sec-cpt-if">Checking your browser…</div>
<script>setTimeout(() => location.replace('/MyFTBAccess/Registration/Business'), 2500);</script>
</body></html>`,
  business: (error = "") =>
    page(
      "Registration | Business",
      form(
        "/MyFTBAccess/Registration/Business",
        `<fieldset><legend>I am registering as</legend>
<label><input type="radio" id="RoleInd" name="Role" value="individual"> Individual</label>
<label><input type="radio" id="RoleBus" name="Role" value="business" required> Business Representative</label></fieldset>
${select("CoType", "Type of company", ["Corporation", "Partnership", "Limited Liability Company"])}
${select("FormType", "Form type", ["100", "100S", "100W", "109"])}
${select("TaxYear", "Tax year", ["2025", "2024", "2023"])}
${input("CorpNo", "California corporation number")}
${input("Zip", "ZIP code", "tel")}
${input("AddrNum", "The numbers in your mailing address", "tel")}
${input("NetInc", "Net income for tax purposes", "tel")}
<div class="form-group"><input id="Decl" name="Decl" type="checkbox" value="true" required><label for="Decl">I declare under penalty of perjury that the information I entered is true and correct.</label></div>`,
      ),
      error,
    ),
  phone: () =>
    page(
      "Registration | Phone",
      form(
        "/MyFTBAccess/Registration/Phone",
        `${input("PhoneNumber", "Phone number", "tel")}
<label><input type="radio" id="ByText" name="How" value="text"> Send me a text message</label>
<label><input type="radio" id="ByCall" name="How" value="call"> Call me</label>
<input id="Phone_Foreign" name="Phone_Foreign" type="text" aria-label="Foreign number">`,
      ),
    ),
  code: (error = "") =>
    page("Registration | Verify", form("/MyFTBAccess/Registration/Code", input("VerificationCode", "Enter the verification code", "text"), '<button type="submit">Verify</button>'), error),
  confirmation: () =>
    page(
      "Registration Confirmation",
      "<p>Registration confirmation: your MyFTB account was successfully created.</p><p>We will mail you a PIN at the address we have on file. It expires 21 days from today.</p>",
    ),
};

function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
  });
}

/** A self-signed certificate for webapp.ftb.ca.gov, made with openssl in a temp dir. */
export function selfSigned(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), "openerrand-cert-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=webapp.ftb.ca.gov"], { stdio: "ignore" });
  try {
    return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function startFakeSite(): Promise<FakeSite> {
  const requests: FakeSite["requests"] = [];
  const posted: FakeSite["posted"] = {};
  let codeAttempts = 0;
  const site: Partial<FakeSite> = { requests, posted, onCode: () => undefined };

  const send = (res: import("node:http").ServerResponse, html: string, status = 200): void => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html);
  };
  const go = (res: import("node:http").ServerResponse, to: string): void => {
    res.writeHead(303, { location: to });
    res.end();
  };

  const server: Server = createServer(selfSigned(), async (req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    requests.push({ method: req.method ?? "GET", path, userAgent: String(req.headers["user-agent"] ?? "") });
    const base = "/MyFTBAccess/Registration";
    if (req.method === "GET") {
      if (path === `${base}/NewAccount`) return send(res, PAGES.terms());
      if (path === `${base}/Profile`) return send(res, PAGES.profile());
      if (path === `${base}/Challenge`) return send(res, PAGES.challenge());
      if (path === `${base}/Business`) return send(res, PAGES.business());
      if (path === `${base}/Phone`) return send(res, PAGES.phone());
      if (path === `${base}/Code`) {
        codeAttempts += 1;
        site.onCode!(codeAttempts);
        return send(res, PAGES.code());
      }
      if (path === `${base}/Confirmation`) return send(res, PAGES.confirmation());
      return send(res, page("Not found", "<p>Not found</p>"), 404);
    }
    const body = await readBody(req);
    posted[path] = body;
    if (path === `${base}/NewAccount`) return body.ReadTerms && body.AcceptTerms ? go(res, `${base}/Profile`) : send(res, PAGES.terms());
    if (path === `${base}/Profile`) {
      const ok =
        body.FstName === FAKE.firstName &&
        body.LstName === FAKE.lastName &&
        body.UserName &&
        body.UserName === body.ReUserName &&
        body.Email === body.ReEmail &&
        (body.Password ?? "").length >= 15 &&
        body.Password === body.RePassword &&
        new Set([body.SecQ1, body.SecQ2, body.SecQ3]).size === 3 &&
        [body.SecA1, body.SecA2, body.SecA3].every((a) => (a ?? "").length >= 3);
      return ok ? go(res, `${base}/Challenge`) : send(res, PAGES.profile("Please correct the errors on this page."));
    }
    if (path === `${base}/Business`) {
      const ok =
        body.Role === "business" &&
        body.CoType === "Corporation" &&
        body.FormType === "100S" &&
        body.TaxYear === FAKE.year &&
        body.CorpNo === FAKE.corpId &&
        body.Zip === FAKE.zip &&
        body.AddrNum === FAKE.addressNumbers &&
        body.NetInc === FAKE.netIncome &&
        body.Decl === "true";
      return ok ? go(res, `${base}/Phone`) : send(res, PAGES.business("The information you entered does not match our records."));
    }
    if (path === `${base}/Phone`) return body.PhoneNumber === FAKE.phone && body.How === "text" ? go(res, `${base}/Code`) : send(res, PAGES.phone());
    if (path === `${base}/Code`) {
      if (body.VerificationCode === FAKE.code) return go(res, `${base}/Confirmation`);
      codeAttempts += 1;
      site.onCode!(codeAttempts);
      return send(res, PAGES.code("The code you entered is incorrect. Enter the newest code we sent."));
    }
    return send(res, page("Not found", "<p>Not found</p>"), 404);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  site.port = address.port;
  site.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return site as FakeSite;
}
