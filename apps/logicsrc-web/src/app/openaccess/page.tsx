import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenAccess · LogicSRC",
  description:
    "OpenAccess is OAuth 2.1 with a grant you can carry: one hub account per person or agent, every app keeps its own users and links them once, permissions delegate narrower to agents, and a subscription bought in one app is honoured by every app that honours the product. Reference hub at openaccess.logicsrc.com.",
  alternates: { canonical: "/openaccess" }
};

const DESCRIPTOR = `{
  "openaccess": "0.1",
  "name": "Agentic Jobs",
  "url": "https://agenticjobs.work",
  "operator": "https://profullstack.com/.well-known/openprofile.md",
  "redirect_uris": ["https://agenticjobs.work/api/v1/openaccess/callback"],
  "jwks": { "keys": [{ "kty": "OKP", "crv": "Ed25519", "kid": "2026-09", "x": "..." }] },
  "scopes": { "jobs:read": "See job posts", "jobs:apply": "Apply on your behalf" },
  "offers": [{ "product": "agenticjobs.work/pro", "name": "Pro", "price": "9 USD/month",
    "links": { "pay": "https://agenticjobs.work/pay/pro?principal={principal}",
               "cancel": "https://agenticjobs.work/me/billing",
               "promote": "https://agenticjobs.work/?ref={principal}" } }],
  "honours": ["agenticjobs.work/pro", "profullstack.com/all-access"],
  "webhooks": "https://agenticjobs.work/api/v1/openaccess/events",
  "hubs": ["https://openaccess.logicsrc.com"]
}`;

const TOKEN = `{
  "iss": "https://openaccess.logicsrc.com",
  "sub": "oa_7f3c9e2a",
  "aud": "agenticjobs.work",
  "scope": "openid email jobs:read jobs:apply entitlements",
  "grant": "g_2b1e", "parent": "g_0a9d",
  "limits": { "per_call": "5 USD", "per_day": "50 USD" },
  "entitlements": ["agenticjobs.work/pro"],
  "exp": 1757703600
}`;

const CLI = `npx @logicsrc/openaccess serve --url https://hub.example      # run a hub
openaccess keygen                                              # an Ed25519 key for your app's descriptor
openaccess descriptor https://your.site > .well-known/openaccess.json
openaccess app add https://agenticjobs.work                    # register by URL; the hub reads the descriptor
openaccess login                                               # device flow: a code, approve it in the browser
openaccess grants | entitlements                               # what you hold
openaccess delegate --for https://bot.example/.well-known/openprofile.md --scope "jobs:read" --per-day "50 USD"
openaccess revoke g_2b1e                                       # and every child under it`;

const FLOWS: Array<[string, string, string]> = [
  ["Link", "Authorization code with PKCE, unchanged from OAuth 2.1", "The app stores sub beside its own user. Its user table is otherwise untouched."],
  ["Device", "RFC 8628: a CLI or agent shows a code, the person approves it at the hub", "The token arrives at the terminal."],
  ["Delegate", "POST /v1/grants with a parent token: a subset of scopes, limits no larger, expiry no later", "An agent gets a refresh token. Revoking the parent revokes every child."],
  ["Entitle", "The seller reports a sale or a cancellation as itself, signed with the key its descriptor names", "Every app that honours the product hears, and every token it is issued carries the product."]
];

const ABSENT: Array<[string, string]> = [
  ["No passwords", "A hub signs people in however it likes; the reference uses a magic link. An app never sees a hub credential."],
  ["No money", "The hub records that a person is entitled; the seller charged them, by card, by CoinPay, by invoice. The hub is the ledger of standing, not of payment."],
  ["No roles", "owner, admin and member are an app's local bundles of scopes. What crosses the wire is the scopes, so two apps can mean the same thing by the same string."],
  ["No silent narrowing", "A scope is granted or the request fails with its name. A system that returns 200 OK with fewer scopes than asked for has broken a person's invoicing before."]
];

export default function OpenAccessPage(): ReactNode {
  return (
    <SiteShell active="OpenAccess">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenAccess</h2>
          <p>
            OAuth 2.1 with a grant you can carry. One account at a hub, every app keeps its own
            users and links them once, and what you gave and what you paid for is yours across all
            of them.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every app has a permissions model and a billing model, and no two agree. In one
          company&apos;s fifteen repositories we counted twelve permission vocabularies and not one
          shared validator. An agent working across them holds twelve credentials and understands
          none. A person who pays for a product pays again next door, because the subscription
          lives in the seller&apos;s table and nowhere else. OpenAccess puts the pieces that already
          exist, OAuth 2.1, <code style={mono}>/.well-known/</code> and webhooks, together so the
          grant and the entitlement belong to the person, and travel.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. A hub is running at{" "}
          <a href="https://openaccess.logicsrc.com/">openaccess.logicsrc.com</a>: sign in, see every
          app you linked, revoke a grant, hand a narrower one to an agent, pay or cancel a
          subscription from one page. Reference implementation at{" "}
          <a href="https://github.com/logicsrc/openaccess">github.com/logicsrc/openaccess</a>: a hub
          on Node 24 with one SQLite file, and a client and CLI.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The app descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openaccess.json</code>. The scopes an app
            understands, the products it sells, the products it honours, and the key it signs with.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>scopes</code> is the registry: a hub refuses any scope not named here,
          by name, and never narrows silently. <code style={mono}>offers</code> carry the pay,
          cancel, manage, upgrade and promote links, with <code style={mono}>{"{principal}"}</code>{" "}
          filled in so a sale or a referral is attributed. <code style={mono}>honours</code> is the
          app&apos;s promise to treat an entitlement as paid whoever sold it.{" "}
          <code style={mono}>jwks</code> is the app&apos;s credential; there is no shared secret to
          leak. <code style={mono}>operator</code> is the person answerable, as an{" "}
          <Link href="/openprofile">OpenProfile.md</Link>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Four flows</h2>
          <p>Three are OAuth as it stands. The fourth is the one OAuth lacks.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Flow</th>
              <th style={th}>How</th>
              <th style={th}>Then</th>
            </tr>
          </thead>
          <tbody>
            {FLOWS.map(([flow, how, then]) => (
              <tr key={flow}>
                <td style={td}>
                  <strong>{flow}</strong>
                </td>
                <td style={td}>{how}</td>
                <td style={td}>{then}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The token</h2>
          <p>A JWT signed by the hub with Ed25519, verified offline against its JWKS.</p>
        </div>
        <pre style={pre}>{TOKEN}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>grant</code> is the handle, <code style={mono}>parent</code> the path
          back to the person, <code style={mono}>limits</code> the app&apos;s to enforce and the
          hub&apos;s to keep no larger than the parent&apos;s.{" "}
          <code style={mono}>entitlements</code> is a snapshot of the honoured products the
          principal holds. Webhooks carry{" "}
          <code style={mono}>X-OpenAccess-Signature: ed25519=&lt;signature of the raw body&gt;</code>,
          verified against the same key that signs tokens.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>From a terminal</h2>
        </div>
        <pre style={pre}>{CLI}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <a href="https://openaccess.logicsrc.com/">openaccess.logicsrc.com</a>: a live hub to
            sign in to, link apps to, or point a CLI at
          </li>
          <li>
            <Link href="/docs/openaccess">Specification</Link>: the descriptor, the hub, linking,
            delegation, entitlements, the token, webhooks, the doors
          </li>
          <li>
            <a href="https://github.com/logicsrc/openaccess">github.com/logicsrc/openaccess</a>: the
            reference hub, client and CLI, <code style={mono}>npx @logicsrc/openaccess</code>
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind an app and the
            identity of an agent; <Link href="/openmcp">OpenMCP</Link>, where a relay names a hub as
            its auth; <Link href="/opencreds">OpenCreds</Link>, where an agent keeps the token it was
            handed
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
