import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openconnection",
  "OpenConnection is a setup token you paste. A bridge that holds a person's connections issues it, any app claims it once for an access URL and a bearer the bridge can revoke, and no app registers, keeps a key or hosts a redirect. SimpleFIN's door, written down for anything a bridge holds: social accounts, a writer, a calendar, a wallet."
);

const CLAIM = `POST https://mynaposter.com/openconnection/claim/2f9c7d1e-…
Content-Type: application/json

{ "app": { "name": "DefPromo", "url": "https://defpromo.com", "version": "1.5.0" } }

200 OK
{
  "access_url": "https://mynaposter.com/openconnection/v1",
  "token": "oc_9k2…",
  "auth": "bearer",
  "scopes": ["accounts:read", "analyze:create", "write:create", "suggest:create", "activity:write"],
  "profiles": ["social"],
  "expires": null,
  "principal": { "name": "Anthony", "openprofile": "https://mynaposter.com/u/anthony/openprofile.md" }
}`;

const DESCRIPTOR = `{
  "bridge": { "name": "myna", "web": "https://mynaposter.com",
              "operator": "https://mynaposter.com/.well-known/openprofile.md" },
  "versions": ["1"],
  "setup": "https://mynaposter.com/connect",
  "profiles": ["social"],
  "scopes": {
    "accounts:read":  "The networks and handles this person connected",
    "analyze:create": "Read a product page into a name, description, audience and features",
    "write:create":   "Draft posts and comments in this person's voice",
    "suggest:create": "Suggest subreddits, hashtags, keywords and forums for a product",
    "activity:write": "Record a post the app made with the person's own hands"
  }
}`;

const STEPS: Array<[string, string]> = [
  ["1. Get a token", "The person signs in at the bridge, picks the scopes, and copies a setup token: base64url of a claim URL, single use, short-lived."],
  ["2. Paste it", "Into the app's settings field. The claim URL is inside the token, so the app needs no host name and no descriptor."],
  ["3. Claim once", "One POST, no credential. The app names itself in the body so the person can recognise it later."],
  ["4. Act through the bridge", "Every request goes to the access URL with the bearer. The bridge enforces the scopes and keeps the list."],
  ["5. Revoke at the bridge", "One control beside each app. The app's next call is 401 revoked; it forgets the token and links back to setup."]
];

const SOCIAL: Array<[string, string, string]> = [
  ["GET /accounts", "accounts:read", "the networks and handles the person connected"],
  ["POST /analyze", "analyze:create", "a product URL read into name, description, audience, features; OpenProfile.md and llms.txt before HTML"],
  ["POST /write", "write:create", "post or comment variations in the person's voice, with the network's limits applied"],
  ["POST /suggest", "suggest:create", "subreddits, hashtags, keywords, and real forums from a directory such as nichedb.dev"],
  ["POST /activity", "activity:write", "a post the app made with the person's own hands, so history and recap see it"],
  ["POST /posts", "posts:create", "only when the descriptor says posts: true; the bridge's own poster queues it"]
];

const ABSENT: Array<[string, string]> = [
  ["No client registration", "The app is named by what it says at claim, and the person judges that name on the bridge's list. A bridge that wants registered apps runs OpenAccess beside this."],
  ["No redirect, no browser round trip", "The person moves the token by hand. That is the feature: a browser extension, a script or a spreadsheet can do it."],
  ["No refresh token", "A token lives until it expires or is revoked. Then the person pastes a new setup token, which takes as long as the first one did."],
  ["No credentials passed through", "A bridge hands an app the result of acting, never the password, cookie or OAuth token behind an account."],
  ["No posting unless declared", "A bridge says posts: true or it does not post. One that never holds a social credential leaves the key out."]
];

export default function OpenConnectionPage(): ReactNode {
  return (
    <SiteShell active="OpenConnection">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenConnection</h2>
          <p>
            A setup token you paste. A bridge issues it, any app claims it once, and no app
            registers, keeps a key or hosts a redirect.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          An app that wants to act through a person&apos;s accounts has one road today, OAuth, and
          that road assumes the app can register with every provider, keep a client secret and
          survive a browser round trip. A browser extension can do none of those safely. A shell
          script cannot. So those apps ask for a password, or a personal API key pasted into a
          settings field, and what they get is the whole account, forever, listed nowhere.{" "}
          <a href="https://www.simplefin.org/protocol.html">SimpleFIN</a> solved this for bank
          data with something smaller than OAuth. OpenConnection is that door, written down for
          anything a bridge holds.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first bridge is <a href="https://mynaposter.com">mynaposter.com</a>,
          serving the <code style={mono}>social</code> profile; the first app claiming it is{" "}
          <a href="https://defpromo.com">DefPromo</a>. SimpleFIN is the{" "}
          <code style={mono}>finance</code> profile, unchanged.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five steps</h2>
        </div>
        <table style={table}>
          <tbody>
            {STEPS.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The claim</h2>
          <p>
            One request, no credential. The bearer that comes back is the whole credential from
            then on, and the bridge can revoke it.
          </p>
        </div>
        <pre style={pre}>{CLAIM}</pre>
        <p style={{ color: "#41505d" }}>
          SimpleFIN puts Basic credentials in the access URL itself, which a browser&apos;s{" "}
          <code style={mono}>fetch</code> refuses outright, so a bridge serving browsers answers{" "}
          <code style={mono}>bearer</code>. A second claim of the same token is{" "}
          <code style={mono}>403 claimed</code>, and the bridge tells the person, because a token
          claimed twice was seen by someone it was not meant for.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Optional for an app, since the claim URL is inside the token. It is how an app links a
            person to <code style={mono}>setup</code> and reads what a bridge can do before asking.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The social profile</h2>
          <p>Scopes use the same resource:action vocabulary as OpenAccess.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>endpoint</th>
              <th style={th}>scope</th>
              <th style={th}>answers</th>
            </tr>
          </thead>
          <tbody>
            {SOCIAL.map(([endpoint, scope, answers]) => (
              <tr key={endpoint}>
                <td style={td}>
                  <code style={mono}>{endpoint}</code>
                </td>
                <td style={td}>
                  <code style={mono}>{scope}</code>
                </td>
                <td style={td}>{answers}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <Link href="/docs/openconnection">Specification</Link>: the descriptor, the setup
            token, the claim, eight rules, the social and finance profiles, with OpenAccess
          </li>
          <li>
            <a href="https://mynaposter.com/connect">mynaposter.com/connect</a>: the first bridge,
            where a person gets a setup token for the social profile
          </li>
          <li>
            <Link href="/openaccess">OpenAccess</Link>, the registered door with the same scopes;{" "}
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a bridge and the
            principal an app acts for
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
