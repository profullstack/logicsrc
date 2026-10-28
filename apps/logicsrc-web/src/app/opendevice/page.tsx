import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/opendevice",
  "OpenDevice is one file an operator keeps about the machines they run: every server, desktop, laptop, phone and tablet, where it runs, what it costs a month, and what anyone on the internet can already see about it. Profiles: OpenServer, OpenDesktop, OpenPhone, OpenTablet."
);

const TOPOLOGY = `OpenDevice  (one record per machine, the inventory)
 ├─ profile: server   ──offer──▶  OpenServer  (what the provider sells)
 ├─ profile: desktop  =  OpenDesktop   (desktops, laptops, workstations)
 ├─ profile: phone    =  OpenPhone
 ├─ profile: tablet   =  OpenTablet
 └─ profile: other    (routers, single-board computers, appliances)`;

const DEVICE = `{
  "id": "app1",
  "name": "app1",
  "profile": "server",
  "hostnames": ["app1.northwind.example"],
  "addresses": { "ipv4": ["203.0.113.10"] },
  "provider": {
    "name": "Example Racks",
    "offer": { "descriptor": "https://racks.example/.well-known/openserver.json", "id": "dedi-epyc-16" }
  },
  "cost": { "amount": 149, "currency": "USD", "interval": "month", "payee": "RACKS EXAMPLE", "paid_with": "paypal", "scope": "business" },
  "observed": {
    "at": "2026-10-28T05:00:00Z",
    "ptr": ["app1.northwind.example"],
    "asn": { "number": 64500, "org": "EXAMPLE-RACKS" },
    "tls": { "issuer": "Let's Encrypt", "not_after": "2027-01-12T00:00:00Z" },
    "ports": [22, 80, 443]
  }
}`;

const PROFILES: Array<[string, string, string]> = [
  ["server", "/docs/openserver", "A machine that serves. Points at the OpenServer offer it was bought as; observed DNS, reverse DNS, ASN, TLS, SSH banner, HTTP header, open well-known ports."],
  ["desktop", "/docs/opendesktop", "Desktops, laptops, mini PCs, workstations. Model, patch level, the vendor's published end of updates."],
  ["phone", "/docs/openphone", "Model and patch level against the vendor's latest, and a line's monthly cost. Never the phone number."],
  ["tablet", "/docs/opentablet", "Model, cellular radio, patch level, vendor support dates."]
];

const READERS: Array<[string, string]> = [
  ["A security dashboard", "Lists every device in the inventory, with or without its agent, so the box nobody installed the daemon on shows up as a gap instead of not at all."],
  ["A finance tool", "Counts each device's cost beside the bank feed. A cost paid by PayPal or crypto never reaches a linked account; the inventory is how it reaches the books. A matched charge counts once."],
  ["A fleet manager", "Reads the device classes and the patch levels, and compares each client device's patch with the vendor's latest without touching it."]
];

export default function OpenDevicePage(): ReactNode {
  return (
    <SiteShell>
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenDevice</h2>
          <p>
            One file an operator keeps about the machines they run: what each one is, where it
            runs, what it costs, and what the internet can already see about it.
          </p>
          <div className="cta-row">
            <Link className="button-primary" href="/docs/opendevice">Read the OpenDevice spec</Link>
            <a className="button-secondary" href="https://www.npmjs.com/package/@profullstack/fleet">
              @profullstack/fleet
            </a>
          </div>
        </div>
        <p style={{ color: "#41505d" }}>
          The security agent knows the boxes it was installed on, the finance tool knows the
          charges that hit a linked card, the fleet manager knows the machines that enrolled, and
          the spreadsheet knows everything as of the day someone last opened it. OpenDevice is the
          one inventory they all read. <Link href="/openserver">OpenServer</Link> says what a
          provider sells; OpenDevice is the other side of the sale.
        </p>
        <p style={{ color: "#5b6b7a" }}>Status: 0.1.</p>
        <pre style={pre}>{TOPOLOGY}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>A device</h2>
          <p>
            Only <code style={mono}>name</code> is required. <code style={mono}>cost</code> is
            optional and stays out of a published file; <code style={mono}>observed</code> holds
            only what anyone could see without the device&apos;s credentials.
          </p>
        </div>
        <pre style={pre}>{DEVICE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Profiles</h2>
        </div>
        <table style={table}>
          <tbody>
            {PROFILES.map(([name, href, what]) => (
              <tr key={name}>
                <td style={td}>
                  <Link href={href}><code style={mono}>{name}</code></Link>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Who reads it</h2>
        </div>
        <table style={table}>
          <tbody>
            {READERS.map(([who, what]) => (
              <tr key={who}>
                <td style={td}><strong>{who}</strong></td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SiteShell>
  );
}
