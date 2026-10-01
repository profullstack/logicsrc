import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";
import { CONF, EXIT_CODES, PHASES, SETTINGS } from "./data";

export const metadata: Metadata = specMetadata(
  "/openinstall",
  "OpenInstall is one idempotent bin/install.sh in every repository. Run on a server from a checkout, it installs the runtime and a local database, builds, writes a systemd unit and an nginx site with TLS, restarts and health-checks the app, and exits 0, 1 or 3 so a deployer knows whether to roll back."
);

const USAGE = `git clone https://git.example.com/acme/ledger.git
cd ledger
./bin/install.sh            # setup + build + activate
./bin/install.sh status     # key=value lines`;

const LAYOUT = `<root>/repo.git                  a mirror of the repository
<root>/releases/<id>             one directory per release
<root>/current -> releases/<id>  what the unit runs (APP_DIR)
<root>/shared/                   STATE_DIR: app.env, db.env, run.sh`;

const RULES: Array<[string, string]> = [
  ["Idempotent", "Every step checks before it acts. A file is written only when its content differs, and systemd and nginx reload only when a file they read changed. The second run changes no file; activate still restarts the service so a fresh build takes effect."],
  ["Owns only its own files", "Every unit and site it writes starts with # managed by bin/install.sh. A file already there without that line is never overwritten: the script exits 1 and says so."],
  ["No secrets in the repository", "bin/install.conf is committed and holds settings only. Secrets live in STATE_DIR/app.env, mode 0600, written by a deployer from a vault or by a person."],
  ["Up before it is routed to", "activate restarts the service and waits for a 2xx or 3xx from the health path on loopback before it touches nginx. An nginx change that fails nginx -t is put back."],
  ["Build, run and state apart", "SRC_DIR is built, APP_DIR is run, STATE_DIR is kept. A deployer builds in releases/<id>, runs from a current symlink, and rolls back by flipping it."]
];

export default function OpenInstallPage(): ReactNode {
  return (
    <SiteShell active="OpenInstall">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenInstall</h2>
          <p>
            One script every repository carries at <code style={mono}>bin/install.sh</code>. Run
            on a server from a checkout, it puts the app into service on that box: the runtime
            and a local database, the build, a systemd unit, an nginx site with a certificate, a
            restart and a health check. Run it twice and the second run changes nothing.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every app on a plain server needs the same dozen steps, and most repositories keep them
          in a README section that was true once or a script on one laptop. A new box means doing
          them from memory, and a second run of a half-written script means a duplicate database
          role or an nginx site with two server blocks. OpenInstall fixes the place, the verbs,
          the settings file and the exit codes, so a person can run any repository&apos;s copy
          after <code style={mono}>git clone</code> and a deployer can run it without reading it
          first.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Bare metal or a VPS, systemd and nginx; no Kubernetes, no platform. The
          reference script is sh1pt&apos;s{" "}
          <code style={mono}>packages/targets/deploy-ssh/bin/install.sh</code>.
        </p>
        <pre style={pre}>{USAGE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Phases</h2>
          <p>
            The first argument. Root, or passwordless sudo, is needed for apt, Postgres, systemd and
            nginx; the service itself runs as the user who ran the script.
          </p>
        </div>
        <table style={table}>
          <tbody>
            {PHASES.map(([name, what]) => (
              <tr key={name}>
                <td style={td}>
                  <code style={mono}>{name}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The rules that make it safe to run again</h2>
        </div>
        <table style={table}>
          <tbody>
            {RULES.map(([rule, meaning]) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>{rule}</strong>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Settings</h2>
          <p>
            <code style={mono}>bin/install.conf</code>, <code style={mono}>KEY=value</code> lines,
            committed. The environment wins. A repository with a lockfile and{" "}
            <code style={mono}>build</code> and <code style={mono}>start</code> scripts needs no
            file at all. A bun app with Postgres and a domain:
          </p>
        </div>
        <pre style={pre}>{CONF}</pre>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>key</th>
              <th style={th}>default</th>
            </tr>
          </thead>
          <tbody>
            {SETTINGS.map(([key, dflt]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>{dflt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Exit codes</h2>
          <p>A deployer reads nothing else to decide whether a release went out.</p>
        </div>
        <table style={table}>
          <tbody>
            {EXIT_CODES.map(([code, meaning]) => (
              <tr key={code}>
                <td style={td}>
                  <code style={mono}>{code}</code>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Deployers</h2>
          <p>
            <code style={mono}>sh1pt ship --target deploy-ssh</code> takes the source from any git
            host the box can read (GitHub, GitLab, Codeberg, a self-hosted forge) or pushes it with
            rsync, writes <code style={mono}>app.env</code> from the vault, runs the
            repository&apos;s script, or a bundled copy when there is none, and flips{" "}
            <code style={mono}>current</code> back when <code style={mono}>activate</code> exits
            non-zero.
          </p>
        </div>
        <pre style={pre}>{LAYOUT}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Not</h2>
        </div>
        <p style={{ color: "#41505d" }}>
          Not a provisioner of the box: no users, firewall, ssh or kernel. Not container
          orchestration: one box, systemd and nginx. Not a package manager: it calls the one the
          lockfile names. Not a CI system, not a secret store, not a release manager. No{" "}
          <code style={mono}>.well-known</code> file: the script lives in the repository and is read
          by whoever has the checkout.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openinstall">Specification</Link>: the phases, the settings and their
            defaults, the state files, exit codes, twelve conformance rules, what a deployer owes
            the script, and a worked example
          </li>
          <li>
            <Link href="/openstack">OpenStack.md</Link>, whose Hosting section can name the script;{" "}
            <Link href="/openserver">OpenServer</Link>, the box a project buys before the script
            runs on it
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
