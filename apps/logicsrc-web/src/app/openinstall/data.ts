// The facts the /openinstall landing page shows, kept apart from page.tsx so
// contract/openinstall.contract.test.ts can hold them against docs/openinstall.md.

export const PHASES: Array<[string, string]> = [
  ["setup", "STATE_DIR and an empty app.env, the runtime when it is missing, a local Postgres database and Redis when asked for, with DATABASE_URL and REDIS_URL recorded in db.env."],
  ["build", "Dependencies from the lockfile, then the build, in SRC_DIR, with the secrets in the environment. Nothing outside the checkout."],
  ["activate", "run.sh and the systemd unit, a restart, the health check, and only then the nginx site, nginx -t, the reload and a certificate."],
  ["status", "key=value lines: app, runtime, src, app_dir, state, unit, active, health, domains. Changes nothing."],
  ["all", "No argument: setup, build, activate, stopping at the first failure."]
];

/** Every setting, in the order docs/openinstall.md lists them, with its default. */
export const SETTINGS: Array<[string, string]> = [
  ["APP", "the repository directory's name"],
  ["RUNTIME", "auto, from the lockfiles"],
  ["INSTALL_CMD", "auto, the frozen-lockfile install"],
  ["BUILD_CMD", "<pm> run build, when there is one"],
  ["START_CMD", "<pm> run start"],
  ["PORT", "3000"],
  ["HEALTH_PATH", "/"],
  ["HEALTH_TIMEOUT", "120"],
  ["DOMAINS", "empty: no nginx site"],
  ["TLS", "1, Let's Encrypt"],
  ["TLS_EMAIL", "none"],
  ["STATIC_DIR", "dist"],
  ["SPA", "0"],
  ["POSTGRES", "0"],
  ["REDIS", "0"],
  ["MAX_BODY", "100m"],
  ["SRC_DIR", "the repository the script is in"],
  ["APP_DIR", "SRC_DIR"],
  ["STATE_DIR", "~/.local/share/<APP>"],
  ["UNIT", "APP"]
];

export const EXIT_CODES: Array<[string, string]> = [
  ["0", "The phase did what it says. status always exits 0."],
  ["1", "An error: a bad setting, a missing tool, a failed build, no root, a file that is not ours, an nginx config that did not test."],
  ["3", "activate restarted the service and the health check did not pass. nginx was not touched. A deployer rolls back."]
];

export const CONF = `# bin/install.conf: committed, no secrets
APP=ledger
PORT=3000
HEALTH_PATH=/healthz
DOMAINS="ledger.example.com www.ledger.example.com"
TLS_EMAIL=ops@example.com
POSTGRES=1`;
