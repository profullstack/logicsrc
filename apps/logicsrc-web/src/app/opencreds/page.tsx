import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { card, mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenCreds · LogicSRC",
  description:
    "OpenCreds is an open standard for credential records and portable vaults: one record for logins, cards, identities, notes, keys and accounts, an end-to-end-encrypted envelope, and a single encrypted file that moves a vault between products without a plaintext CSV.",
  alternates: { canonical: "/opencreds" }
};

const TYPES: Array<[type: string, code: string, holds: string]> = [
  ["login", "1", "Username, password, TOTP seed, matching URIs, password history"],
  ["card", "2", "Cardholder, brand, number, expiry, security code"],
  ["identity", "3", "Name, address, and identity document numbers"],
  ["note", "4", "Free text, plus any custom fields"],
  ["key", "5", "SSH and PGP keys, API tokens, certificates, .env secrets"],
  ["account", "6", "A provider account and the OAuth tokens that act as it"]
];

const SCHEMAS: Array<[name: string, file: string]> = [
  ["Item", "logicsrc-opencreds-item.schema.json"],
  ["Item envelope", "logicsrc-opencreds-envelope.schema.json"],
  ["Vault metadata", "logicsrc-opencreds-vault-meta.schema.json"],
  ["Database", "logicsrc-opencreds-database.schema.json"],
  ["Manifest", "logicsrc-opencreds-manifest.schema.json"],
  ["Audit event", "logicsrc-opencreds-audit-event.schema.json"]
];

const DOCS: Array<[slug: string, title: string, blurb: string]> = [
  ["opencreds", "Overview", "What the standard defines, and what it deliberately does not."],
  ["credential-sharing", "Credential Sharing", "The sync half: moving a key/value pair between providers."]
];

export default function OpenCredsPage(): ReactNode {
  return (
    <SiteShell active="OpenCreds">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenCreds</h2>
          <p>
            An open standard for <strong>credential records and portable vaults</strong>. It defines
            what a credential item is, how a vault is encrypted, and what a vault looks like as a
            file — so that moving a vault between two products is a supported operation rather than
            a plaintext CSV export.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          It exists because leaving a password manager currently means writing every secret you own
          to disk in the clear, and losing whatever the spreadsheet had no column for. A CSV is
          plaintext by construction, lossy by omission, and carries no integrity: nothing in it says
          which rows were meant to be there, so a truncated import looks exactly like a complete one.
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Status: <strong>0.1 draft</strong>. Reference implementation:{" "}
          <code style={mono}>@logicsrc/opencreds</code>. A conforming vault is a file and a key — no
          account, no server, no network call.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One record, six types</h2>
          <p>
            Logins, cards, identities, notes, keys and accounts are not six features. They are one
            record with a <code style={mono}>type</code> and a named field group, so everything the
            user typed lives inside a single encrypted blob — which is what makes password history
            free: it is an array in that blob, encrypted by construction rather than needing its own
            protected table.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Type</th>
                <th style={th}>Code</th>
                <th style={th}>What it holds</th>
              </tr>
            </thead>
            <tbody>
              {TYPES.map(([type, code, holds]) => (
                <tr key={type}>
                  <td style={{ ...td, ...mono }}>{type}</td>
                  <td style={td}>{code}</td>
                  <td style={td}>{holds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "#5b6b7a", fontSize: "0.9rem", marginTop: "0.9rem" }}>
          The type code is stored in plaintext beside the ciphertext so a server can filter and
          paginate without decrypting. That is the metadata the design accepts leaking, and it says
          so rather than obscuring it: a server learns you hold forty logins and two cards, never
          which sites or what values.
        </p>
        <pre style={pre}>{`{
  "v": 1,
  "id": "6f1e7b3a-1f4e-4f0f-9a1d-6a2f0b6f8d21",
  "type": "login",
  "name": "GitHub",
  "folderId": null,
  "login": {
    "username": "anthony",
    "password": "…",
    "totp": "otpauth://totp/GitHub:anthony?secret=…",
    "uris": [{ "uri": "https://github.com", "match": "domain" }]
  },
  "history": [],
  "createdAt": "2026-08-29T00:00:00.000Z",
  "updatedAt": "2026-08-29T00:00:00.000Z"
}`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One envelope, one key hierarchy</h2>
          <p>AES-256-GCM over the record, with the item id bound in as additional authenticated data.</p>
        </div>
        <pre style={pre}>{`master password
      │  PBKDF2-HMAC-SHA256(salt, 600,000)      ← the only expensive step
      ▼
 master key (32 bytes)         never encrypts anything itself
      │
      ├─ HKDF("<ns>:vault:wrap:v1")     → wrap key  → AES-GCM → protected user key
      ├─ HKDF("<ns>:vault:auth:v1")     → auth hash → server (hashed again there)
      └─ HKDF("<ns>:vault:recovery:v1") → recovery wrap → recovery blob

 user key (32 random bytes)    ← what every item is actually encrypted under
      │
      └─ AES-256-GCM(iv, item JSON, AAD = "<ns>:vault:item:<v>:<id>")`}</pre>
        <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
          <div style={card}>
            <strong>Why the id is in the AAD.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              Without it a ciphertext is portable between rows. Anyone with write access to the
              storage could copy a low-value login&rsquo;s ciphertext into a high-value one&rsquo;s
              row and watch what the user does next — they unlock, see the credential they expected
              under a name they trust, and use it. With the id bound in, that swap fails to decrypt.
            </p>
          </div>
          <div style={card}>
            <strong>Why the user key is random, not derived.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              A master password change re-wraps 32 bytes. Derive item keys from the password instead
              and every change rewrites every item — a long window in which a partial failure leaves
              half the vault openable by the old password and half by the new.
            </p>
          </div>
          <div style={card}>
            <strong>Why the auth hash cannot decrypt.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              The wrap key and the auth hash come out of the same master key under different HKDF
              labels, whose outputs are computationally independent. A server holding every auth hash
              it has ever seen holds nothing that helps it derive a wrapping key. That is what makes
              &ldquo;the server cannot read the vault&rdquo; a property rather than a promise.
            </p>
          </div>
          <div style={card}>
            <strong>Why the KDF floor is checked in the client.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              Parameters arrive from a server, so they are attacker-controlled the moment it is
              compromised. A client that trusted <code style={mono}>iterations: 1</code> would hand
              an attacker who has been capturing auth hashes an offline guessing exercise with no
              work factor. Conforming clients refuse below 100,000 before deriving anything.
            </p>
          </div>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One file</h2>
          <p>
            A vault exports as a single <code style={mono}>.opencreds</code> JSON document,
            encrypted by default, whose header is bound as additional authenticated data over the
            payload.
          </p>
        </div>
        <pre style={pre}>{`{
  "opencreds": "0.1",
  "type": "opencreds.database",
  "protected": true,
  "namespace": "opencreds",
  "exportedAt": "2026-08-29T18:00:00.000Z",
  "generator": { "name": "@logicsrc/opencreds", "version": "0.1.0" },
  "kdf": { "kdf": "pbkdf2-sha256", "iterations": 600000, "salt": "…" },
  "manifest": {
    "itemCount": 42,
    "types": { "login": 38, "card": 2, "key": 1, "account": 1 },
    "folderCount": 3,
    "digest": "…"
  },
  "iv": "…",
  "ciphertext": "…"
}`}</pre>
        <p style={{ color: "#41505d" }}>
          Because the header is the AAD, the manifest is authenticated by the same tag as the data.
          The counts can be shown in a preview before anyone types a passphrase, and they cannot be
          lied about. After decrypting, a conforming implementation recomputes all four fields and
          refuses the import if any disagrees.
        </p>
        <p style={{ color: "#41505d" }}>
          That is the difference between an import you can trust and a CSV. A CSV truncated at 3,000
          rows imports 3,000 rows and reports success. A database that was truncated does not decrypt
          at all; one edited after decryption fails its digest. There is no state in which a
          conforming implementation reports a complete import of an incomplete file.
        </p>
        <div style={{ ...card, borderColor: "#e0c9a8", background: "#fdf8f1" }}>
          <strong>The plaintext form exists, and it is loud.</strong>
          <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
            Some people are moving <em>to</em> a product that reads nothing else, and an export
            format that cannot express that gets worked around with a script that is worse — no
            warning, no file mode, no label. So it is specified: never the default, an explicit flag
            plus a confirmation, owner-only file mode, and{" "}
            <code style={mono}>&quot;protected&quot;: false</code> in the header so tooling can
            identify the file without parsing the rest of it.
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Namespaces, and why they are data</h2>
        </div>
        <p style={{ color: "#41505d" }}>
          Every domain-separation label is prefixed by the vault&rsquo;s{" "}
          <code style={mono}>namespace</code>. This is not decoration. A label is compiled into the
          additional authenticated data of every ciphertext a vault has ever written, and into the
          HKDF derivation of its keys. Change a label string and every vault in the world that used
          it becomes undecryptable — not corrupted, not recoverable, undecryptable.
        </p>
        <p style={{ color: "#41505d" }}>
          So labels are append-only in the strongest sense available: superseded by a new{" "}
          <code style={mono}>:v2</code> label, never edited. And because MarkSyncr&rsquo;s vault
          shipped with <code style={mono}>marksyncr:vault:*</code> labels before this specification
          existed, the prefix is carried as a per-vault property. A deployed vault declares its
          namespace and is conformant; a new one uses <code style={mono}>opencreds</code>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Two profiles, one envelope</h2>
          <p>A profile is how the user key is managed. The item envelope is identical in both.</p>
        </div>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={card}>
            <strong style={mono}>user</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              The user key is wrapped by a key derived from a master password. One person, one
              password, one vault.
            </p>
          </div>
          <div style={card}>
            <strong style={mono}>team</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              The vault key is random and sealed to each member&rsquo;s X25519 public key. The server
              holds one wrapped key per member and never the key itself; granting access is an
              existing member unwrapping and re-sealing. This is the scheme{" "}
              <code style={mono}>logicsrc credentials</code> already implements — OpenCreds adds only
              the observation that the thing being wrapped can be a vault of items rather than a bag
              of strings.
            </p>
            <p style={{ margin: "0.35rem 0 0", color: "#5b6b7a", fontSize: "0.9rem" }}>
              Stated plainly: every member holding the vault key reads every item in it. Revoking a
              member means rotating the key and re-encrypting, because a key they held is a key they
              may have kept. Partial sharing is not a feature of a shared key; it is a second vault.
            </p>
          </div>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Using it</h2>
          <p>
            The same commands ship as <code style={mono}>logicsrc vault …</code> and as the
            standalone <code style={mono}>opencreds</code> binary, from one implementation, so the
            two cannot drift.
          </p>
        </div>
        <pre style={pre}>{`# Create a vault; prints a recovery key exactly once
logicsrc vault init

# Add items
logicsrc vault add login --name GitHub --username anthony --url https://github.com
logicsrc vault add card  --name "Visa ending 4242"
logicsrc vault add key   --name "deploy key" --key-type ssh --file ~/.ssh/id_ed25519

# List and read; never prints a secret unless you name one
logicsrc vault list --type login
logicsrc vault get GitHub --field login.password --reveal

# Move the vault, encrypted, and preview before writing
logicsrc vault export --out vault.opencreds
logicsrc vault import vault.opencreds --dry-run

# Arrive from somewhere else
logicsrc vault import bitwarden-export.csv --source bitwarden --dry-run`}</pre>
        <p style={{ color: "#5b6b7a", fontSize: "0.9rem" }}>
          Importers ship for Bitwarden, 1Password, Chrome, LastPass and KeePass. A row that cannot be
          mapped is reported with its line number and a reason rather than dropped — the person still
          has the source file, and only knows to go back for it if they are told.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Schemas</h2>
          <p>
            Published in <code style={mono}>@logicsrc/schemas</code> as JSON Schema draft 2020-12,
            so a third party can conform without reading LogicSRC source.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Schema</th>
                <th style={th}>File</th>
              </tr>
            </thead>
            <tbody>
              {SCHEMAS.map(([name, file]) => (
                <tr key={file}>
                  <td style={td}>{name}</td>
                  <td style={{ ...td, ...mono }}>{file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
          {DOCS.map(([slug, title, blurb]) => (
            <a key={slug} href={`/docs/${slug}`} style={{ ...card, textDecoration: "none", color: "inherit", flex: "1 1 16rem" }}>
              <strong>{title}</strong>
              <p style={{ margin: "0.35rem 0 0", color: "#5b6b7a", fontSize: "0.9rem" }}>{blurb}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>How it relates to the other specs</h2>
        </div>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={card}>
            <strong>Credential Sharing</strong> moves secrets <em>between providers</em> — .env,
            Doppler, Railway, GitHub, SSH — and models a key/value pair and a sync plan. OpenCreds
            models the <em>record</em> and the <em>vault file</em>. They meet at the{" "}
            <code style={mono}>key</code> item: a synced .env entry, stored rather than moved.
          </div>
          <div style={card}>
            <strong>OpenContext</strong> governs what an agent may <em>read</em>. An agent resolving
            a context bundle may be entitled to one OpenCreds item and not the vault; the permission
            decision is OpenContext&rsquo;s, the record shape is OpenCreds&rsquo;.
          </div>
          <div style={card}>
            <strong>OpenOntology</strong> names the entities a credential belongs to. An{" "}
            <code style={mono}>account</code> item&rsquo;s <code style={mono}>provider</code> is an
            ontology entity, not a free string, where an ontology is in use.
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
