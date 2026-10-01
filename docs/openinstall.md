# OpenInstall

OpenInstall is one script every application repository carries at `bin/install.sh`. Run on a server from a checkout, it puts the application into service on that box: the runtime and the local services it needs, its dependencies and its build, a systemd unit, an nginx site with a certificate, a restart and a health check. It is idempotent, so running it a second time changes nothing, and it never touches a file on the box it did not write. A person runs it by hand after `git clone`; a deployer runs the same script, phase by phase, inside a release directory. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a script the Profullstack fleet already ships, published so any repository can carry one and any deployer can run it.

Slug: `openinstall`

## The problem

Every application that runs on a plain server needs the same dozen steps: install a runtime, create a database, install dependencies, build, write a service unit, write a reverse-proxy site, get a certificate, restart, check that it answers. Most repositories keep those steps in a README section that was true once, in a deploy script on one person's laptop, or in a platform's dashboard that is gone the day the bill stops being paid. A new box means doing them again from memory, and a second run of a half-written script means a duplicate database user or an nginx site with two `server` blocks.

The pieces exist. systemd runs services, nginx terminates TLS, certbot issues certificates, apt installs the rest, and every one of them can be driven from a shell script without a person at the keyboard. What is missing is an agreed place for that script, an agreed way to call it, and a contract strong enough that a deployer can run any repository's copy without reading it first: the same phases, the same settings file, the same exit codes, the same promise not to break what is already on the box.

## Terms

- A **box** is one server the application runs on: bare metal, a VPS, a virtual machine. One operating system, one systemd, one nginx.
- A **checkout** is a copy of the repository's tree on the box, from `git clone`, `git archive` or `rsync`.
- The **script** is `bin/install.sh` in a repository.
- A **phase** is one of the script's verbs: `setup`, `build`, `activate`, `status`.
- A **setting** is one `KEY=value` the script reads, from `bin/install.conf` or the environment.
- A **secret** is a value that must not be committed: an API key, a database password, a signing key.
- A **deployer** is anything that places a checkout on a box and runs the script for it: a person with ssh, `sh1pt ship --target deploy-ssh`, a CI job.
- A **release** is one checkout a deployer built, kept in its own directory so the previous one is still there.

## The script

`bin/install.sh`, executable, at the root of the repository. The reference implementation is a single bash file with no dependencies beyond what a Debian or Ubuntu box has: [sh1pt `packages/targets/deploy-ssh/bin/install.sh`](https://github.com/profullstack/sh1pt/blob/master/packages/targets/deploy-ssh/bin/install.sh). A repository copies it into `bin/`, commits it, and writes a `bin/install.conf` beside it when the defaults are not right.

```
./bin/install.sh            # setup + build + activate
./bin/install.sh setup      # runtime (bun/node), postgres, redis
./bin/install.sh build      # dependencies + build, in the checkout
./bin/install.sh activate   # systemd unit, nginx + TLS, restart, health check
./bin/install.sh status     # key=value lines
./bin/install.sh help       # the header, with every setting
```

## Phases

The first argument is the phase. No argument means `all`.

| phase | what it does | needs root |
| --- | --- | --- |
| `setup` | Creates `STATE_DIR` (mode 0700) and an empty `app.env` (0600) when there is none. Installs the runtime when it is missing: bun from bun.sh for `RUNTIME=bun`; for `RUNTIME=node` it requires Node to be present. Provisions a local Postgres database and role when `POSTGRES` is set and a local Redis when `REDIS=1`, recording `DATABASE_URL` and `REDIS_URL` in `db.env`. | for apt, Postgres and Redis |
| `build` | Loads `db.env` and `app.env`, then runs `INSTALL_CMD` and `BUILD_CMD` in `SRC_DIR`, the build with `NODE_ENV=production`. Writes nothing outside the checkout and the package manager's cache. | no |
| `activate` | Writes `STATE_DIR/run.sh` and the systemd unit, reloads systemd if either changed, enables and restarts the unit, and waits for the health check. Only after the application answers does it write the nginx site for `DOMAINS`, test it with `nginx -t`, reload, and request a certificate when there is none. For `RUNTIME=static` there is no unit: nginx serves `STATIC_DIR` from `APP_DIR`. | for systemd and nginx |
| `status` | Prints `key=value` lines (`app`, `runtime`, `src`, `app_dir`, `state`, `unit`, `active`, `health`, `domains`) and exits 0. Changes nothing. | no |
| `all` | `setup`, then `build`, then `activate`, stopping at the first failure. | as above |

Root means root, or a user with passwordless `sudo`. The script never prompts; a step that needs root and cannot get it exits 1 and says which step. The service itself runs as the user who ran the script, not as root.

## Settings

`bin/install.conf` holds the settings, one `KEY=value` per line, `#` comments, values optionally quoted. It is committed and it never holds a secret. The environment wins over the file, so a deployer or a person can override any key for one run without editing it.

| key | meaning | default |
| --- | --- | --- |
| `APP` | Name, used for the unit and the nginx site. Lower-cased, anything outside `a-z0-9-` becomes `-`. | the repository directory's name |
| `RUNTIME` | `auto`, `bun`, `node` or `static`. `auto` reads the lockfiles: `bun.lock` or `bun.lockb` is bun, a pnpm, npm or yarn lockfile is node, a bare `package.json` is bun, no `package.json` is static. | `auto` |
| `INSTALL_CMD` | `auto`, `none` or a command. `auto` is the frozen-lockfile install for the lockfile found. | `auto` |
| `BUILD_CMD` | `none` or a command. | `<pm> run build` when `package.json` has a `build` script, else `none` |
| `START_CMD` | The command the service runs. Required unless `RUNTIME=static`. | `<pm> run start` when `package.json` has a `start` script |
| `PORT` | The application listens here, on loopback. Passed to the service as `PORT`. | `3000` |
| `HEALTH_PATH` | `activate` GETs this until it answers 2xx or 3xx. | `/` |
| `HEALTH_TIMEOUT` | Seconds to wait for that answer. | `120` |
| `DOMAINS` | Space- or comma-separated host names. An nginx site for them; none when empty. | empty |
| `TLS` | `1` requests a Let's Encrypt certificate with certbot, `0` serves plain http. | `1` |
| `TLS_EMAIL` | The ACME account email. | none |
| `STATIC_DIR` | `RUNTIME=static`: the directory nginx serves, relative to `APP_DIR`. | `dist` |
| `SPA` | `1`: an unknown path falls back to `/index.html`. | `0` |
| `POSTGRES` | `0`, `1` or a database name. `1` names the database and its role after `APP`, with `-` as `_`. | `0` |
| `REDIS` | `0` or `1`. | `0` |
| `MAX_BODY` | nginx `client_max_body_size`. | `100m` |
| `SRC_DIR` | The checkout to build. | the repository the script is in |
| `APP_DIR` | Where the service runs from. | `SRC_DIR` |
| `STATE_DIR` | Where `app.env`, `db.env` and `run.sh` live. | `~/.local/share/<APP>` |
| `UNIT` | The systemd unit name, without `.service`. | `APP` |

A key the script does not know is still read and exported, so a build command can see it.

## State

Three files in `STATE_DIR`, which outlives every checkout and every release:

| file | written by | holds |
| --- | --- | --- |
| `app.env` | the deployer, or a person | The secrets, as `KEY=value` lines, mode 0600. Created empty by `setup` when missing and never written by the script after that. A deployer writes it from a vault; nobody commits it. |
| `db.env` | `setup` | `DATABASE_URL` and `REDIS_URL` for what `setup` provisioned, mode 0600. A line that is already there is never rewritten, so a database password is generated once. |
| `run.sh` | `activate` | The service's entry point: `cd APP_DIR` and `exec START_CMD`. |

The service reads `db.env` and then `app.env`, and `build` sources them in the same order, so a value in `app.env` wins. An application that uses an external database sets `DATABASE_URL` in `app.env` and leaves `POSTGRES=0`.

The files the script writes outside `STATE_DIR` are `/etc/systemd/system/<UNIT>.service`, the nginx site at `/etc/nginx/sites-available/<APP>.conf` with its `sites-enabled` link (or `/etc/nginx/conf.d/<APP>.conf` where there is no `sites-available`), and the certificate certbot keeps under `/etc/letsencrypt/live/<first domain>/`. Each file it writes starts with the marker line `# managed by bin/install.sh`.

## Exit codes

| code | meaning |
| --- | --- |
| `0` | The phase did what it says. For `status`, always. |
| `1` | An error: a bad setting, a missing tool, a failed build, a step that needed root, a file that is not ours, an nginx configuration that did not test. The script stops at the step that failed and says which. |
| `3` | `activate` restarted the service and the health check did not pass within `HEALTH_TIMEOUT`. The last 40 lines of the unit's journal are printed. The nginx site was not touched. |

A deployer treats any non-zero code from `activate` as a failed release and puts the previous one back.

## The rules

A script conforms to OpenInstall 0.1 when it does all of these.

### 1. It lives at `bin/install.sh`

At the root of the repository, executable, with a shebang. It runs without a terminal and never prompts. Settings live beside it in `bin/install.conf` when there are any. That path is the whole of discovery: a deployer looks for the file in the checkout, and finds it or uses its own generic copy.

### 2. The first argument is a phase

`setup`, `build`, `activate`, `status`, or nothing for `all`, which is `setup`, `build` and `activate` in that order. `help` prints the settings. Any other argument exits 1 and names the phases.

### 3. Every step checks before it acts

Installing a package checks for the command first. Creating a database checks for the role and the database. A file is written only when its content differs from what is there, and systemd and nginx are reloaded only when a file they read changed. A second run with nothing new changes no file on the box. The one thing `activate` always does is restart the service, because that is how a fresh build takes effect.

### 4. It never overwrites a file it did not write

Every unit, site and entry point the script writes carries the marker `# managed by bin/install.sh`. Before writing one, the script looks at the file already there; if it exists without the marker, the script exits 1 and says to move it aside or pick another `APP` or `UNIT`. An application installed on a box that already runs other things cannot take their names.

### 5. Settings come from `bin/install.conf` and the environment

`KEY=value` lines, committed, no secrets. The environment wins. Every key has a default, so a repository with a `package.json`, a lockfile and `build` and `start` scripts needs no `install.conf` at all to be built and run on port 3000.

### 6. Secrets live in `STATE_DIR/app.env`, and only there

Mode 0600, in a directory of mode 0700, written by whoever holds the secrets. Never in the repository, never in `install.conf`, never in the unit file, never on a command line. The script creates it empty when it is missing and otherwise only reads it.

### 7. Build, run and state are three directories

`SRC_DIR` is built, `APP_DIR` is run, `STATE_DIR` is kept. By default the first two are the same checkout. A deployer that builds each release in its own directory sets `SRC_DIR=releases/<id>`, `APP_DIR=current` (a symlink it flips) and a `STATE_DIR` that every release shares. The unit points at `APP_DIR`, so flipping the symlink and running `activate` switches the release, and flipping it back rolls one back.

### 8. `activate` proves the service is up before it routes to it

After the restart the script requests `http://127.0.0.1:PORT` plus `HEALTH_PATH` until it answers 2xx or 3xx or `HEALTH_TIMEOUT` passes. Only then does it touch nginx. On timeout it exits 3.

### 9. A proxy change that does not test is put back

The new nginx site is tested with `nginx -t` before the reload. When the test fails the previous file is restored, or the new one removed when there was none, and the script exits 1. A certificate that cannot be issued yet, usually because DNS does not point at the box, is a warning: the site serves plain http and the next run tries again.

### 10. Exit codes are 0, 1 and 3

As in the table above. A deployer reads nothing else to decide whether a release went out.

### 11. `status` changes nothing

It prints `key=value` lines, one fact per line, and exits 0 whether or not the service is up. `active` is what systemd says; `health` is the HTTP status of the health check, or `down` when nothing answers.

### 12. It puts one application on the box it runs on

The script does not reach other machines, does not create the user it runs as, does not configure the firewall, ssh or the kernel, and does not touch another application's unit, site or database. Two applications on one box are two checkouts, two `APP` names and two runs.

## Deployers

A person is a deployer:

```
git clone https://git.example.com/acme/ledger.git
cd ledger
./bin/install.sh
```

`sh1pt ship --target deploy-ssh` is the reference deployer. It takes the source from any git host the box can read (GitHub, GitLab, Codeberg, or a self-hosted forge such as git.chovy.com) or pushes it with `rsync`, and lays the box out as:

```
<root>/repo.git                  a mirror of the repository
<root>/releases/<id>             one directory per release, <UTC yyyymmddHHMMSS>-<sha7>
<root>/current -> releases/<id>  what the unit runs
<root>/shared/                   STATE_DIR: app.env, db.env, run.sh, deploys.log
```

For each release it:

1. Places the checkout in `releases/<id>`.
2. Writes `shared/app.env` from the vault, atomically, mode 0600.
3. Runs the repository's `bin/install.sh setup` and `build` with `SRC_DIR=releases/<id>`, `APP_DIR=current` and `STATE_DIR=shared`. When the repository has no `bin/install.sh`, it runs a bundled copy of the reference script. A build failure stops here, and the release that was current stays current.
4. Flips `current` to the new release and runs `activate`.
5. On a non-zero exit, flips `current` back and runs `activate` for the previous release.
6. Records the outcome and prunes old releases.

Rollback is the same flip to an older release followed by `activate`. Any other deployer that follows these steps can run any conforming script.

## Worked example

A bun application called ledger, with a Postgres database and a domain. The repository has `bun.lock` and a `package.json` with `build` and `start` scripts, and the application answers `GET /healthz`. Its `bin/install.conf`:

```
# bin/install.conf: committed, no secrets
APP=ledger
PORT=3000
HEALTH_PATH=/healthz
DOMAINS="ledger.example.com www.ledger.example.com"
TLS_EMAIL=ops@example.com
POSTGRES=1
```

On a fresh Ubuntu box, as a user `deploy` with passwordless sudo, `./bin/install.sh` does this:

1. `setup`: finds `bun.lock`, so `RUNTIME=bun`. Installs bun for `deploy`. Installs `postgresql`, creates the role and database `ledger` with a random password, and appends `DATABASE_URL='postgres://ledger:...@127.0.0.1:5432/ledger'` to `~/.local/share/ledger/db.env`.
2. `build`: runs `bun install --frozen-lockfile`, then `bun run build` with `NODE_ENV=production`, with `DATABASE_URL` and everything in `app.env` in its environment.
3. `activate`: writes `~/.local/share/ledger/run.sh` and `/etc/systemd/system/ledger.service`, enables and restarts `ledger`, and waits for `http://127.0.0.1:3000/healthz`. Then installs nginx, writes `/etc/nginx/sites-available/ledger.conf` as a plain http proxy for both names, tests and reloads it, runs certbot for both names, rewrites the site with the certificate and an http to https redirect, and reloads again.

The secrets go in `~/.local/share/ledger/app.env` before the first run or between runs, by hand or from a deployer:

```
SESSION_SECRET='...'
COINPAY_API_KEY='...'
```

Run it again and the only thing that happens is a restart and a health check: bun is there, the database is there, `DATABASE_URL` is already in `db.env`, the unit and the site have the same content, and the certificate exists. `./bin/install.sh status` then prints:

```
app=ledger
runtime=bun
src=/home/deploy/ledger
app_dir=/home/deploy/ledger
state=/home/deploy/.local/share/ledger
unit=ledger
active=active
health=200
domains=ledger.example.com www.ledger.example.com
```

## Not

**Not a provisioner of the box.** It does not create users, harden ssh, open ports, set up swap or install a kernel. The box is given; the script puts one application on it.

**Not container orchestration.** No images, no scheduler, no cluster. One box, systemd and nginx. A team that wants Kubernetes has it; this is the other path.

**Not a package manager.** It does not resolve dependencies or publish anything. It calls the package manager the lockfile names, and apt for the few system packages it needs.

**Not a CI system.** It does not run tests or decide whether a commit should ship. It builds and runs what it is given.

**Not a secret store.** It reads `app.env`; it does not know where the values came from and never writes them.

**Not a release manager.** The script knows one checkout. Releases, the `current` symlink, rollback and pruning belong to the deployer.

**No `.well-known` file.** The script is read by whoever has the checkout. Nothing about it is served from a site.

## Relationship to other standards

- [OpenStack.md](/openstack) says what a project is built on; its `Hosting` section can say `bin/install.sh (OpenInstall): systemd and nginx on one box`. The runtime the script detects is the one OpenStack.md lists.
- [OpenServer](/openserver) is what a hosting provider sells. OpenInstall is what runs on the box once it is bought.
- [OpenFleet](/openfleet) is the record an agent session carries; an agent deploying through sh1pt runs this script under that record.
- GitHub's "Scripts to Rule Them All" (`script/bootstrap`, `script/setup`, `script/server`) is the closest earlier idea: a fixed place in every repository for the commands that set it up. That pattern is for a developer's laptop; this one is for the server, with the idempotency and ownership rules a server needs.
- A `Procfile` names the start command for a platform that does the rest. Here the rest is in the repository.
- A `Dockerfile` builds an image for a container runtime. A repository may carry both; OpenInstall is the path with no container runtime on the box.

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-01 | First publication: `bin/install.sh` and `bin/install.conf`, four phases and `all`, the settings and their defaults, `STATE_DIR` with `app.env`, `db.env` and `run.sh`, the ownership marker, exit codes 0, 1 and 3, the build, run and state split, what a deployer owes the script, with sh1pt's script as the reference implementation and `sh1pt ship --target deploy-ssh` as the reference deployer. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
