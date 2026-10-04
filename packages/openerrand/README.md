# @logicsrc/openerrand

The reference runner for [OpenErrand](https://logicsrc.com/docs/openerrand):
one JSON file that describes an errand on a website with no API, run in
headless Chrome, stopping at every step that belongs to a person.

It reads an errand file, validates it with `@logicsrc/validators`, resolves
every input before the browser opens, then for each page finds its step,
tests the outcomes, fills the form from the rules (id first, label second,
choices before text), hands every gate to a person, and presses the forward
button, until the site answers or the runner has to stop.

## Install

```bash
curl -fsSL https://logicsrc.com/install.sh | sh
logicsrc errand --help
```

The commands live in this package and the umbrella CLI mounts them as
`logicsrc errand`. To embed the runner:

```bash
npm install @logicsrc/openerrand
```

## Commands

```bash
logicsrc errand validate ftb-register-business.json
logicsrc errand run ftb-register-business.json --extractor "python3 extract.py ~/taxes" --dry-run
logicsrc errand run ftb-register-business.json --extractor "python3 extract.py ~/taxes" --declare
logicsrc errand status
```

| Flag | What |
| --- | --- |
| `--input name=value` | Give an input's value (repeatable). Wins over every source. |
| `--dry-run` | Fill every page up to the first that holds a declaration or a shared secret, show it with secrets masked and the declaration word for word, and stop before its forward button. Not counted by the throttle. |
| `--declare` | Your consent, for this run, to tick the declarations the errand names. Never read from a file, the environment or a saved default. |
| `--headful` | A visible window, so you can take identity proofing or a captcha yourself. |
| `--chrome PATH` | The Chrome or Chromium binary (default: `CHROME_PATH`, then PATH, then the Puppeteer and Playwright caches). |
| `--vault TARGET` | `teams:<team>/<project>/<env>`, `opencreds[:<field>]` or `file:<path>`. Default: the file's `metadata.vault`, else a 0600 file. |
| `--extractor CMD` | The local command that reads your documents (see below). |
| `--candidate N` | Which shared-secret candidate to submit; a rejection lists the others. |
| `--account NAME` | Which account at the site, for the throttle. |
| `--force` | Lift the per-window, per-day and spacing caps. Never a lockout. |
| `--yes` | Run a file whose SHA-256 changed since its last run without asking. |
| `--json` | Print the run record on stdout. |

Exit codes: 0 success, waiting or dry run; 1 rejected; 2 invalid file or
usage; 3 stopped (a gate, an unmatched field, a loop, off-site, a timeout);
4 refused by the throttle.

## Inputs

| Source | Served by |
| --- | --- |
| `document` | `--extractor`: a command on this machine. It gets `{ "errand", "documents": [{ "input", "form", "field", "match" }] }` on stdin and prints `[{ "form", "field", "value", "year", "label", "file", "page" }]`. The runner applies `match`, `years`, `pick` and `transform`, and keeps the values in memory only. No extractor is bundled. |
| `vault` | The vault target, read-only here. |
| `prompt` | The terminal; a secret does not echo. With no terminal the next source is tried. |
| `generate` | `crypto.randomInt`, at least one character of each class, a letter first when letters are allowed. |
| `derive`, `candidate`, `literal` | The file and the other inputs. |

A shared-secret input's document sources become a ranked list of candidates
(sources in order, newest year first within each). A run submits one; a
rejection ends the run and lists the others for you to choose with
`--candidate`. Nothing is ever retried on its own.

## Gates

| Gate | What the runner does |
| --- | --- |
| `declare` | Stops on the page and prints the statement word for word, unless you passed `--declare`; then it shows the values on the page (secrets masked) and ticks the box. |
| `identity-proofing` | Never touches the provider's pages (it reads only the URL). Headless, it stops and tells you; with `--headful` at a terminal it waits until the page is back on the site. |
| `code` | The terminal prompt, or the code file `~/.local/share/logicsrc/errand/codes/<name>.code` written by whoever holds the phone. Used once, never logged. A wrong code waits for the next one. |
| `mail` | Ends the run waiting, with the deadline and the hand-off card in the run record. |
| `captcha` | Yours: a visible window with `--headful`, or the run stops. A program may pass a `CaptchaSolver`, and it is called only when the step says `solver: allowed` and the errand is outside the forbidden set (a stated sector that is not government, tax, financial, healthcare or identity-provider; no declaration or identity proofing; no secret input). Each use is logged with the time, URL and service. No solver ships with this package. |
| `wait` | Polled until its match no longer fits, then the run goes on. Never solved or bypassed. |

## What it keeps

Under `$LOGICSRC_ERRAND_HOME`, else `~/.local/share/logicsrc/errand` (files
0600, directories 0700):

| Path | What |
| --- | --- |
| `throttle.json` | Attempts and lockouts. 2 runs of an errand per account in 30 minutes, 4 a day; 2 minutes between runs on one site; nothing during a lockout. A lockout is the file's `metadata.lockout.text` pattern (lasting `metadata.lockout.duration`) or a default pattern (35 minutes), and it holds every errand on that site and account. |
| `approvals.json` | The SHA-256 of each errand file last run. A changed file is shown and not run without `--yes` or a yes at the terminal. |
| `runs/` | One run record per run: outcome, page, candidate (no value), card, deadline. Never an input value. |
| `pages/<name>.jsonl` | The page log: each page's fields (selector, type, label, required, options) and a result page's text. Never a value. |
| `profiles/<host>/` | One Chrome profile per site, kept so a passed bot check stays passed. |
| `codes/<name>.code` | Where a code may be written. |
| `credentials/<name>.env` | Credentials when no writable vault is named. |

Hand-off cards stay in the run record and `errand status`. They are never
posted anywhere, and a card that names a personal or secret input is refused.

## Browser

Chrome over the DevTools protocol, no dependency. The user agent is Chrome's
own with `HeadlessChrome` replaced by `Chrome`, given at launch so it reaches
every request; nothing else about the browser is changed.

## Library

```ts
import { loadErrand, resolveInputs, runErrand, openCdpDriver, Store, fileVault } from "@logicsrc/openerrand";
```

`runErrand` takes a `Driver` factory, so an embedder can bring its own
browser; the tests drive it with a scripted fake and one integration test runs
the FTB example in real headless Chrome against a local fake site.

## License

MIT
