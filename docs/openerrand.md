# OpenErrand

OpenErrand is one JSON file that describes an errand a person runs on a website that has no API: registering for a tax account, downloading a transcript, renewing a licence. It names the site and the pages to start from, the inputs and where each may come from, the rules that fill each form field, the steps a runner must hand to a person and never automate, what success and rejection look like on the page, what is kept afterwards and where, and the card a person gets when the errand has to wait for the post. A person reads the file before running it and knows every value it will send and every statement it will ask them to make; an agent runs the same file in a headless browser and stops exactly where a person is needed. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of an errand a runner already performs, published so others can write errands, review them and run them.

Slug: `openerrand`

## The problem

Government and institutional sites are where people spend the hours nobody wants to spend: a tax board, a licensing office, a benefits portal. Most have no API and no OAuth. An account is a browser form checked against a figure from last year's return, then a code by text, then a PIN by letter. The forms change without notice, a bot check sits in front of them, and one wrong answer can lock the account.

People already automate these. They do it with a script on one laptop that nobody else can read, or with an agent told "register me at the FTB" and left to guess. The script hides what it sends. The agent guesses at fields it has never seen, ticks a penalty-of-perjury box because the form would not submit without it, and tries a second figure when the first is rejected. Neither can be reviewed before it runs, and neither can be shared.

What is missing is the errand written down: the fields it fills and with what, the values that are secret, the steps that belong to a person, and the point where it stops. Written down, an errand can be read by the person it acts for, reviewed by someone else, published, and run by any runner that keeps the same promises.

## Terms

- An **errand** is one task on one site that ends in an outcome a person cares about: an account registered, an account activated, a document downloaded. Its **errand file** is the JSON document this specification describes.
- A **site** is the website the errand runs on, named by its origins.
- The **principal** is the person or organisation the errand acts for, and whose data it uses.
- A **runner** is the program that reads an errand file and drives a browser through it.
- An **input** is one value the errand needs: a name, a ZIP code, a figure from a return, a password.
- A **field** is one form control on a page, as a runner reads it: its id, name, type, the label a person would read, whether it is required, and its options.
- A **rule** decides what to do with a field.
- A **step** is one kind of thing that happens during a run: a form page, a wait, or a **gate**.
- A **gate** is a step only a person can take. A runner hands it to a person and never performs it.
- An **outcome** is what the site says at the end: success, rejected, or waiting.
- A **hand-off card** is the note a person gets when the errand needs them later. It carries steps and never a secret.
- A **publisher** is whoever writes and serves an errand file. It is usually not the site.

## The errand file

A JSON document, served as `application/json`, conventionally named `<name>.json`. The smallest valid errand is a site, one page step and one outcome:

```json
{
  "type": "logicsrc.openerrand",
  "version": "0.1",
  "name": "example-contact-form",
  "title": "Send the contact form",
  "site": { "name": "Example", "origins": ["https://example.com"], "start": ["https://example.com/contact"] },
  "steps": [{ "id": "form", "kind": "page" }],
  "outcomes": [{ "name": "sent", "kind": "success", "text": "thank you" }]
}
```

The top-level keys:

| key | meaning |
| --- | --- |
| `type` | Always `logicsrc.openerrand`. |
| `version` | `0.1`. |
| `id` | The https URL the file is published at. The dedupe key for an index or a directory. |
| `name` | A slug, unique within the publisher: `ftb-register-business`. A mail gate's `resume` names another errand by it. |
| `title` | What a person reads first: `Register a MyFTB business account`. |
| `description` | A paragraph a person reads before running it. |
| `publisher` | The publisher's [OpenProfile.md](/openprofile) URL. |
| `updated` | When anything in the file last changed, ISO 8601. |
| `reference` | A URL for the runner or the code the errand was taken from. |
| `principal` | `self`: the person running it is the principal. `represented`: they act for the principal with authority to, as a corporation's officer does for the corporation. |
| `site` | `name`, `origins` (the https origins the runner may navigate), `start` (the URLs a run opens, in order of preference), `terms` (the site's terms of use). |
| `limits` | `pages` (the most pages one run may submit, default 15), `page_timeout` (default `PT30S`), `same_page` (how many times the same URL may come back before the run stops as a loop, default 2). |
| `inputs` | The values the errand needs, by name. |
| `rules` | The field rules, applied on every page step. |
| `steps` | Page steps, waits and gates. |
| `submit` | How the runner finds a page's forward button. |
| `outcomes` | What success, rejection and waiting look like. |
| `retry` | What the runner may do again. |
| `outputs` | What is kept after a success, and where. |
| `handoffs` | The cards a person gets, by id. |
| `metadata` | Anything the publisher wants to add. Every other unknown key is an error, so a typo in a gate is caught before a run. |

Patterns throughout are ECMAScript regular expressions, matched case-insensitively. Durations are ISO 8601 (`PT15M`, `P21D`).

## Inputs

Each input has a `type` (`string`, `integer`, `number`, `email`, `date`, `boolean`, or `qa-set` for security questions and their answers), a `sensitivity`, and an ordered list of `sources`. Optional keys: `label` (what a person is shown), `required`, `pattern` (a value must match it), `max_length` (the value is cut to it when filled, because the site's box takes no more), `count` (for a `qa-set`), and `role`.

### Sensitivity

| class | what it is | where it may appear |
| --- | --- | --- |
| `public` | Anything already public or harmless: a corporation number on the state register, a tax year. | Logs, the terminal, hand-off cards, the run record. |
| `personal` | Identifies a person: a name, an address, an email, a phone number, a user name. | The terminal of the principal, the site's own fields, the vault. Never in a log, never on a card. |
| `secret` | Proves who someone is or opens an account: a password, a security answer, an SSN, a figure from a return used as a shared secret, a PIN. | The site's own field and the vault, and nowhere else. Masked on the terminal as `••••`. |

A runner treats an input with no stated sensitivity as an error, not as public.

### Sources

Sources are tried in order and the first that yields a value wins.

| source | where the value comes from |
| --- | --- |
| `document` | Extracted on the principal's machine from the principal's own files: `form` and `field` as printed (`CA 100S`, `line 20`), an optional `match` for the printed label, `pick` (`newest`, `oldest`, `each`), `years` (`back`, how many closed years count, and `current`, whether the year in progress does), and a `transform`. The runner records which file and page each value came from. The document never leaves the machine. |
| `vault` | A key in the principal's vault, such as an [OpenCreds](/opencreds) vault. Listed before `generate`, so a second run reuses the login the first one made. |
| `prompt` | Asked of a person at run time, with `ask` as the question. A secret prompt does not echo. |
| `generate` | A fresh random value from the runner's cryptographic generator: `length`, `classes` (`lower`, `upper`, `digit`, `special`) with at least one character of each, `special` for the characters the site accepts. A generated credential is written to the vault on success. |
| `derive` | Another input, with a `transform`: the numbers in a street address are `{ "from": "derive", "input": "street", "transform": "digits" }`. |
| `candidate` | One `part` (`year`, `form`, `field`, `source`) of the candidate chosen for a shared-secret input, so the tax year sent is the year the figure came from. |
| `literal` | A fixed `value`. |

Transforms are `digits` (keep the digits), `whole` (whole units, a leading minus for a loss, no separators), `upper`, `lower`, `trim`, `first:N` and `last:N`.

### Roles

- `shared-secret`: a value the site checks against its own records to prove the principal is who they say. Always `secret`. Its `document` sources produce a ranked list of candidates (sources in order, newest year first within each), and a run submits exactly one of them. See [Retry](#outcomes-and-retry).
- `credential`: a login the errand creates or uses. Written to the vault when `outputs.vault` names it.
- `identifier`: a number that names the principal at the site, such as an account number.

## Field rules

A runner reads every visible, enabled control on a page into a field: `id`, `name`, `type`, `label` (the `label for`, then `aria-label`, then a wrapping label, then the group's legend, then the placeholder), `required`, and `options` for a select. A rule is:

```json
{ "name": "zip", "label": "zip|postal", "types": ["text", "tel", "number"], "do": { "text": "{{zip}}" } }
```

`name` appears in logs and errors. `id` is tested against the field's id; `label` against the field's id, name and label joined by spaces. `types` limits the rule to those field types; a rule without `types` fits any. At least one of `id` and `label` is required.

### Matching

1. **Id first, label second.** The runner tries every rule with an `id` before any rule's `label`. Ids are what the publisher saw on the site and are exact; labels cover pages not yet seen.
2. **The first fitting rule decides.** An id match is final even when its action is `skip`. A label match whose action cannot act (no option matches, the radio's label is the wrong one, the input has no value) lets the next rule try.
3. **A page step's own `rules` come before the errand's.**
4. **Choices before text.** Selects, radios and checkboxes are filled first; then the page is read again and text boxes are filled, because choosing a security question or a form type changes what the page asks next.
5. **An unmatched required field stops the run.** The runner names the field, its label and type, and the page. When the page step says `"unmatched": "ask"` and a person is at a terminal, the runner may ask them instead. It never guesses.

### Actions

| action | what the runner does |
| --- | --- |
| `text` | Sets the field to the template, with `{{input}}` replaced by the input's value. `split` (`[3, 2, 4]`) fills a value spread over several boxes, taking the part from the digit at the end of the field's id. |
| `select` | Chooses the first option whose text or value matches one of the patterns, tried in order. `{{input}}` inside a pattern is replaced by the value with regular-expression characters escaped. |
| `check` | `true` ticks the box or radio. `{ "label": pattern }` ticks a radio only when its own label matches. |
| `skip` | Leaves the field as it is. |
| `choose` | For a `qa-set` input: chooses the first question not yet used and records it with its answer. |
| `answer` | For a `qa-set` input: types the answer to the question chosen in the select before the box, or the question the page prints. |
| `gate` | Hands the field to the gate step with that id. |

The runner sets a value with the element's native setter and then fires `input`, `change` and `blur`, so a page's own validation sees it.

## Steps

On each page the runner takes the first step whose `match` fits (`url`, `title`, `text` as patterns, `selector` as a CSS selector that must find an element; all that are given must fit). A page step without `match` fits any page and is the fallback. Gates are also reached from a rule's `gate` action and from an outcome's `then`.

| kind | what it is |
| --- | --- |
| `page` | A form page: fill it from the rules, then press its forward button. |
| `wait` | An interstitial the page clears by itself, such as a proof-of-work bot check. The runner polls every `poll` until `match` no longer fits, and stops when `timeout` passes. It never solves or bypasses the check. |
| `declare` | A legal attestation. A gate. |
| `identity-proofing` | Proving who you are to an identity provider: a selfie, a video call, a document scan. A gate. |
| `code` | A one-time code sent to the principal. A gate. |
| `mail` | A letter the site posts to the principal. A gate. |
| `captcha` | A test meant to tell a person from a program. A gate. |

## Human gates

A gate is first-class because it is the part of an errand that matters most and the part an automation is most tempted to fake. Every gate step carries `why`, the sentence a person reads about what is being asked of them.

### `declare`

A box or button by which the principal states something under penalty of perjury, or otherwise attests that what was entered is true. `statement` is a pattern for the text.

The runner ticks it only with the principal's consent for this run, given after the runner has shown the values that will be attested, secrets masked. Consent is a flag the person types (`--declare`), a button they press, or an answer at a prompt. It is never read from a configuration file, an environment variable, the errand file, a saved default, or another agent's say-so. Without it the runner stops on that page, prints the statement word for word, and submits nothing.

### `identity-proofing`

A redirect to an identity provider (ID.me, Login.gov, a bank's own check) that asks for a face, a video call or a scan of an ID. `provider` names it and `origins` lists its origins.

A runner does not automate any of it. It does not click, type or run script on a page from those origins, does not supply a camera, microphone or file to the provider (no virtual camera, no recorded video, no emulated device), does not read what the provider shows, and does not ask a model to act as the person. It hands the browser session to the principal in a visible window, or ends the run with a hand-off card when no person is present. It resumes only when the page is back on one of `site.origins`, before `timeout`.

### `code`

A one-time code sent by `sms`, `email`, `voice` or an authenticator `app`. `relay` lists how it reaches the runner: `terminal` (typed at a prompt), `file` (written to a file the runner names and watches, by whoever holds the phone or by an agent the principal set up to relay their messages), or `page` (a box in the runner's own interface). `pattern` checks the code and `timeout` is how long the runner keeps the browser session open waiting for it.

The runner uses the code once and never logs it, stores it or shows it again. When a page offers a choice between a text and a call, a rule chooses the channel the relay can carry.

### `mail`

A letter, usually with a PIN, that only the addressee can read. `what` names it, `arrives` says when, `expires` is how long it is good for from the run. `resume` names the errand that continues once it comes, and `input` the input that errand takes from the letter.

A mail gate ends the run with outcome kind `waiting`. The runner delivers the `handoff` card, on the surface described in [Hand-off cards](#hand-off-cards), with `{{expires_on}}` set to the run date plus `expires`, and the continuing errand marks the card done when it succeeds.

### `captcha`

A runner does not send a captcha to a solving service, a model, or a person paid to solve them. It shows the page to the principal in a visible window, or stops. A `wait` step is not a captcha: a proof of work the page's own script solves asks nothing of a person, and waiting for it is all a runner does.

## Outcomes and retry

Before filling each page, the runner reads the page's error messages (or, when there are none, its text) and tests every outcome of kind `rejected` first, then the others in order. `text` and `url` are patterns; when both are given both must fit. `then` names the step that follows an outcome, as the PIN letter follows a registration.

| kind | meaning |
| --- | --- |
| `success` | The errand did what it says. |
| `rejected` | The site said no. The run ends. |
| `waiting` | The errand is done for now and continues when a mail gate's letter arrives. |

A runner adds one outcome of its own, `stopped`, with the reason: `unmatched` (a required field nothing fills), `loop` (the same page came back `limits.same_page` times), `pages` (`limits.pages` passed), `timeout`, `gate` (a gate was refused or nobody was there), `off-site` (a navigation left `site.origins`), or `no-forward` (no forward button, with the buttons seen).

`retry` says what may be done again:

- `shared_secret` is always `never`, and is `never` when absent. A run submits one candidate for a shared-secret input. When the site rejects it, the run ends, the runner lists the other candidates with where each came from, and a person chooses the next one for the next run. A runner never submits a second candidate on its own, never cycles through them, and never sends a list. Sites lock accounts after a few wrong answers, and the person, not the runner, decides whether a lock is worth risking.
- `page_errors` is `rejected` (the default) or `continue`. With `rejected`, a validation error shown on any page after the first ends the run as rejected instead of being answered by a second guess.

A runner reports the run as a record an agent can read, with no input values in it:

```json
{
  "errand": "https://logicsrc.com/examples/openerrand/ftb-register-business.json",
  "outcome": "registered",
  "kind": "success",
  "at": "2026-10-04T17:20:11Z",
  "page": "https://webapp.ftb.ca.gov/MyFTBAccess/Registration/Confirmation",
  "candidate": { "year": 2025, "form": "CA 100S", "field": "line 20" },
  "handoff": "pin-letter/7f3k2q"
}
```

## Outputs

`outputs.vault` writes credentials to the principal's vault when the outcome named in `when` happens: `keys` maps each vault key to a template. The vault is written before the runner reports success. A runner with no vault keeps them in a state file only the principal can read (mode 0600) and says so.

`outputs.downloads` files what the site hands over: each entry has a `match` (`url`, `filename` as patterns, `type` as a media type) and a `to` path template, such as `~/Documents/irs/{{tax_year}}/account-transcript.pdf`. A runner checks that a file is what `type` says before filing it, and never overwrites a file with different bytes.

Inputs never go anywhere else. A runner does not send them to a model, a telemetry endpoint, or a log. Its page log records each page's fields (selector, type, label, required, options) and never their values, which is what a publisher needs to fix a rule.

## Hand-off cards

A card is what a person gets when the errand needs them later: a title, numbered steps, a URL to `open`, and a `command` to run. The run record names it by an opaque id (`pin-letter/7f3k2q`), never by a URL on another service.

A card is delivered only on the surface that owns the errand's data. For a tax or finance errand that is the principal's finance app, through its own CLI, PWA, MCP server or API (CoinPay, for example), or the runner's own terminal. It is never delivered through a social network, a promotion or marketing tool, a posting or scheduling service, or any other third party, and never sent to anyone but the principal. A card for an errand with any personal or secret input does not leave that surface at all: no copy, link, notification text or preview of it is handed to another service.

Its templates may name `{{expires_on}}`, `{{errand.title}}`, `{{site.name}}` and public inputs, and nothing else. A runner refuses to render a card that names a personal or secret input, and a validator rejects the file. No PIN, password, SSN, figure from a return or address ever goes on one.

## Discovery

An errand file can be published at any https URL. A publisher lists its errands at `/.well-known/openerrand.json` on its own origin:

```json
{
  "type": "logicsrc.openerrand-index",
  "version": "0.1",
  "publisher": "https://logicsrc.com/.well-known/openprofile.md",
  "updated": "2026-10-04T00:00:00Z",
  "errands": [
    {
      "url": "https://logicsrc.com/examples/openerrand/ftb-register-business.json",
      "name": "ftb-register-business",
      "site": "https://webapp.ftb.ca.gov",
      "title": "Register a MyFTB business account",
      "gates": ["declare", "code", "mail"],
      "updated": "2026-10-04T00:00:00Z"
    }
  ]
}
```

`gates` lets a person see, before fetching anything else, what an errand will ask of them. A page can also point at an index with `<link rel="openerrand" href="...">` or a `Link: <...>; rel="openerrand"` header.

An errand is **verified** when its file came from the origin of the index that lists it: that publisher stands behind it. It is **site-endorsed** only when the site itself serves the index, because only then has the institution said this is how its forms work. A runner shows both before the first run.

## The rules

A runner conforms to OpenErrand 0.1 when it does all of these.

### 1. It shows the errand before it runs it

The title, the publisher, whether the file is verified or site-endorsed, every gate with its `why`, and every input with its sensitivity and source. The file a person approved is the file that runs: a runner records the file's SHA-256 and shows the change before running a file whose hash differs.

### 2. It stays on the site

It navigates only to `site.origins` and to the origins of an identity-proofing gate it has handed to a person. A redirect anywhere else ends the run as `stopped: off-site`.

### 3. It matches by id, then by label, and never guesses

As in [Matching](#matching). A required field no rule fills stops the run, or is asked of a person at a terminal when the step allows it.

### 4. It never performs a gate

A `declare` box is ticked only on the principal's consent for this run. Identity proofing, captchas and letters are the person's. A code comes only through a declared relay.

### 5. It submits one shared secret per run

And never retries one. A rejection ends the run and lists the other candidates for a person to choose from.

### 6. It keeps documents on the machine

Extraction runs locally. A document, or any page of one, is never uploaded, sent to a model, or copied off the machine by the runner.

### 7. It keeps each value in its class

`public` may go anywhere; `personal` goes to the principal's terminal, the site's fields and the vault; `secret` goes to the site's field and the vault, masked everywhere else.

### 8. It logs fields and never values

The page log holds selectors, types, labels, required flags and options. A value never appears in a log, an error, or the run record.

### 9. It puts nothing personal or secret on a card, and keeps the card where the data lives

Only built-ins and public inputs go on a card, and the card is delivered only on the surface that owns the errand's data (for a tax or finance errand, the principal's finance app or the runner's own terminal), never through a social, promotion or third-party posting service, as in [Hand-off cards](#hand-off-cards).

### 10. It writes credentials before it reports success

To the vault in `outputs.vault`, or to a 0600 state file when there is none. A login that exists only in a terminal's scrollback is a login lost.

### 11. It waits out an interstitial and does not defeat it

A `wait` step is polled until it clears or times out. A runner does not solve, skip or spoof its way past a check.

### 12. It has a dry run

A dry run fills every page up to the first page that holds a `declare` gate or a shared-secret input, prints what it would send there with secrets masked and the declaration word for word, and stops before that page's forward button. Nothing a site keeps is created by a dry run.

### 13. It stops on a loop

The same URL `limits.same_page` times, or more than `limits.pages` pages, ends the run as stopped, with the page log path.

## Worked example

Registering a MyFTB account for a California S corporation at the Franchise Tax Board. FTB has no API: the account is a browser registration checked against a figure from a filed Form 100S, a code texted to the representative's phone, and a PIN mailed to the address on file. The reference runner is `ftb` in [cli-tools](https://github.com/profullstack/cli-tools/pull/125), and this file transcribes its rule table, gates and outcomes. The file holds no personal data: every value comes from the principal's own returns, vault or terminal at run time.

```json
{
  "type": "logicsrc.openerrand",
  "version": "0.1",
  "id": "https://logicsrc.com/examples/openerrand/ftb-register-business.json",
  "name": "ftb-register-business",
  "title": "Register a MyFTB business account",
  "description": "Creates a MyFTB account for a California S corporation at the Franchise Tax Board, proving the business with a figure from a filed Form 100S. FTB then mails a PIN; activation is a second errand.",
  "publisher": "https://logicsrc.com/.well-known/openprofile.md",
  "updated": "2026-10-04T00:00:00Z",
  "reference": "https://github.com/profullstack/cli-tools/pull/125",
  "principal": "self",
  "site": {
    "name": "California Franchise Tax Board (MyFTB)",
    "origins": ["https://webapp.ftb.ca.gov"],
    "start": ["https://webapp.ftb.ca.gov/MyFTBAccess/Registration/NewAccount"]
  },
  "limits": { "pages": 15, "page_timeout": "PT30S", "same_page": 2 },
  "inputs": {
    "email": {
      "label": "Email address FTB writes to",
      "type": "email",
      "sensitivity": "personal",
      "required": true,
      "sources": [{ "from": "prompt" }]
    },
    "phone": {
      "label": "Mobile number FTB texts a verification code to",
      "type": "string",
      "pattern": "^[0-9]{10}$",
      "sensitivity": "personal",
      "required": true,
      "sources": [{ "from": "prompt" }]
    },
    "first_name": {
      "label": "Representative's first name",
      "type": "string",
      "max_length": 11,
      "sensitivity": "personal",
      "sources": [{ "from": "document", "form": "CA 540", "field": "first name", "pick": "newest" }]
    },
    "last_name": {
      "label": "Representative's last name",
      "type": "string",
      "max_length": 13,
      "sensitivity": "personal",
      "sources": [{ "from": "document", "form": "CA 540", "field": "last name", "pick": "newest" }]
    },
    "street": {
      "label": "Street address on the newest return",
      "type": "string",
      "sensitivity": "personal",
      "sources": [{ "from": "document", "form": "CA 540", "field": "street address", "pick": "newest" }]
    },
    "address_numbers": {
      "label": "The numbers in the address on file",
      "type": "string",
      "sensitivity": "personal",
      "sources": [{ "from": "derive", "input": "street", "transform": "digits" }]
    },
    "zip": {
      "label": "ZIP code on file",
      "type": "string",
      "sensitivity": "personal",
      "sources": [{ "from": "document", "form": "CA 540", "field": "ZIP code", "pick": "newest", "transform": "first:5" }]
    },
    "corp_id": {
      "label": "California corporation number",
      "type": "string",
      "sensitivity": "public",
      "sources": [{ "from": "document", "form": "CA 100S", "field": "California corporation number", "pick": "newest" }]
    },
    "tax_year": {
      "label": "Tax year of the return the shared secret comes from",
      "type": "integer",
      "sensitivity": "public",
      "sources": [{ "from": "candidate", "input": "net_income", "part": "year" }]
    },
    "net_income": {
      "label": "Net income for tax purposes, whole dollars",
      "type": "integer",
      "sensitivity": "secret",
      "role": "shared-secret",
      "sources": [
        { "from": "document", "form": "CA 100S", "field": "line 20", "match": "net income for tax purposes", "years": { "back": 5, "current": false }, "transform": "whole" },
        { "from": "document", "form": "CA 100S", "field": "line 15", "match": "net income \\(loss\\) for state purposes", "years": { "back": 5, "current": false }, "transform": "whole" }
      ]
    },
    "username": {
      "label": "MyFTB user name",
      "type": "string",
      "sensitivity": "personal",
      "role": "credential",
      "sources": [
        { "from": "vault", "key": "FTB_BUSINESS_USERNAME" },
        { "from": "generate", "length": 15, "classes": ["lower", "digit"] }
      ]
    },
    "password": {
      "label": "MyFTB password",
      "type": "string",
      "sensitivity": "secret",
      "role": "credential",
      "sources": [
        { "from": "vault", "key": "FTB_BUSINESS_PASSWORD" },
        { "from": "generate", "length": 24, "classes": ["lower", "upper", "digit", "special"], "special": "!#$*@" }
      ]
    },
    "security": {
      "label": "Three security questions and their answers",
      "type": "qa-set",
      "count": 3,
      "sensitivity": "secret",
      "role": "credential",
      "sources": [
        { "from": "vault", "key": "FTB_BUSINESS_SECURITY_ANSWERS" },
        { "from": "generate", "length": 10, "classes": ["lower", "digit"] }
      ]
    }
  },
  "rules": [
    { "name": "read terms", "id": "^ReadTerms$", "types": ["checkbox"], "do": { "check": true } },
    { "name": "accept terms", "id": "^AcceptTerms$", "types": ["checkbox"], "do": { "check": true } },
    { "name": "first name", "id": "^FstName$", "do": { "text": "{{first_name}}" } },
    { "name": "middle initial", "id": "^MInitial$", "do": { "skip": true } },
    { "name": "last name", "id": "^LstName$", "do": { "text": "{{last_name}}" } },
    { "name": "suffix", "id": "^Sffx$", "do": { "skip": true } },
    { "name": "user name again", "id": "^ReUserName$", "do": { "text": "{{username}}" } },
    { "name": "user name", "id": "^UserName$", "do": { "text": "{{username}}" } },
    { "name": "email again", "id": "^ReEmail$", "do": { "text": "{{email}}" } },
    { "name": "email", "id": "^Email$", "do": { "text": "{{email}}" } },
    { "name": "password again", "id": "^RePassword$", "do": { "text": "{{password}}" } },
    { "name": "password", "id": "^Password$", "do": { "text": "{{password}}" } },
    { "name": "foreign number", "id": "^Phone_Foreign$", "do": { "skip": true } },
    { "name": "foreign address", "id": "^Address_Foreign$|^Address_No(MailAddress|PostalCode)$", "do": { "skip": true } },
    { "name": "security question", "label": "question", "types": ["select-one"], "do": { "choose": "security" } },
    { "name": "security answer", "label": "question|answer", "types": ["text", "password"], "do": { "answer": "security" } },
    { "name": "role", "label": "individual|business representative", "types": ["radio"], "do": { "check": { "label": "^\\s*business representative" } } },
    { "name": "zip", "label": "zip|postal", "types": ["text", "tel", "number"], "do": { "text": "{{zip}}" } },
    { "name": "address numbers", "label": "numbers in (the |your )?(business )?(mailing )?address", "types": ["text", "tel", "number"], "do": { "text": "{{address_numbers}}" } },
    { "name": "tax year", "label": "year (of|on) the tax return|tax year", "types": ["select-one"], "do": { "select": ["^\\s*{{tax_year}}\\s*$"] } },
    { "name": "tax year", "label": "year (of|on) the tax return|tax year", "types": ["text", "tel", "number"], "do": { "text": "{{tax_year}}" } },
    { "name": "net income", "label": "net income|income \\(loss\\)", "types": ["text", "tel", "number"], "do": { "text": "{{net_income}}" } },
    { "name": "company type", "label": "type of company|company type|entity type", "types": ["select-one"], "do": { "select": ["^\\s*corporation\\s*$", "corporation"] } },
    { "name": "account number", "label": "account number|entity id|corporation (id|number)", "types": ["text", "tel", "number"], "do": { "text": "{{corp_id}}" } },
    { "name": "form type", "label": "form type|type of (tax )?(return|form)", "types": ["select-one"], "do": { "select": ["100\\s*S\\b"] } },
    { "name": "declaration", "label": "perjury|i declare|under penalty", "types": ["checkbox"], "do": { "gate": "declaration" } },
    { "name": "phone", "label": "phone number", "types": ["text", "tel", "number"], "do": { "text": "{{phone}}" } },
    { "name": "send a text", "label": "send me a text|text message", "types": ["radio"], "do": { "check": true } },
    { "name": "verification code", "label": "verification code|security code|one[- ]time|passcode|access code|enter (the )?code", "types": ["text", "tel", "number", "password"], "do": { "gate": "text-code" } }
  ],
  "steps": [
    {
      "id": "bot-check",
      "kind": "wait",
      "match": { "title": "^Challenge Validation$", "selector": "#sec-cpt-if" },
      "timeout": "PT90S",
      "poll": "PT3S",
      "say": "FTB's bot check is a proof of work the page's own script solves; the runner waits for it."
    },
    {
      "id": "form",
      "kind": "page",
      "unmatched": "stop",
      "say": "Every MyFTB registration page: terms, profile, security questions, role, address, shared secret, phone."
    },
    {
      "id": "declaration",
      "kind": "declare",
      "statement": "perjury|i declare|under penalty",
      "why": "Ticking this box is the representative stating, under penalty of perjury, that what was entered is true. Only that person can make the statement."
    },
    {
      "id": "text-code",
      "kind": "code",
      "channel": "sms",
      "relay": ["terminal", "file"],
      "pattern": "^\\w{4,10}$",
      "timeout": "PT15M",
      "why": "FTB texts a code to the phone number given. Whoever holds the phone reads it out."
    },
    {
      "id": "pin-letter",
      "kind": "mail",
      "what": "MyFTB PIN letter",
      "arrives": "5 to 10 business days, to the address FTB has on file",
      "expires": "P21D",
      "resume": "ftb-activate-business",
      "input": "pin",
      "handoff": "pin-letter",
      "why": "FTB activates a new account with a PIN it sends by US Mail. Nobody but the addressee can read it."
    }
  ],
  "submit": {
    "labels": "^(submit|continue|next|log ?in|login|activate|send( code| me a code)?|verify|confirm)$",
    "never": "^(back|cancel|end session|previous)$",
    "ignore": "#timer, .modal"
  },
  "outcomes": [
    {
      "name": "rejected",
      "kind": "rejected",
      "text": "does not match our records|there is a problem|unable to (verify|process) your|account (is|has been) locked"
    },
    {
      "name": "registered",
      "kind": "success",
      "text": "registration confirmation|successfully (registered|created)|we will (mail|send) you a (letter|pin)|pin .*(mail|letter)",
      "then": "pin-letter"
    }
  ],
  "retry": { "shared_secret": "never", "page_errors": "rejected" },
  "outputs": {
    "vault": {
      "when": "registered",
      "keys": {
        "FTB_BUSINESS_USERNAME": "{{username}}",
        "FTB_BUSINESS_PASSWORD": "{{password}}",
        "FTB_BUSINESS_EMAIL": "{{email}}",
        "FTB_BUSINESS_SECURITY_ANSWERS": "{{security}}"
      }
    }
  },
  "handoffs": {
    "pin-letter": {
      "title": "FTB PIN letter: business MyFTB account",
      "open": "https://webapp.ftb.ca.gov/MyFTBAccess/",
      "steps": [
        "Watch the mail at the address FTB has on file for the MyFTB PIN letter (5 to 10 business days).",
        "Activate before {{expires_on}}: the PIN expires 21 days after registration.",
        "Run the command below yourself, with the PIN from the letter."
      ],
      "command": "ftb activate business --pin <PIN from the letter>"
    }
  }
}
```

What a run looks like, for a fictional representative Jane Doe of 1234 Maple St, Sacramento, CA 95814, and her corporation, number 1234567. The candidates for the shared secret come first:

```
$ ftb secrets
Business (Form 100S), best first:
  2025  100S  line 20      48210  corp 1234567  2025/100S.pdf p3
  2025  100S  line 15      51377  corp 1234567  2025/100S.pdf p3
  2024  100S  line 20      39875  corp 1234567  2024/100S.pdf p3
```

A dry run walks the pages and stops on the one with the declaration:

```
$ ftb register business --email jane@example.com --phone 5555550100 --dry-run
Registering a business MyFTB account as jdoeb4k2x <jane@example.com>
  shared secret: 2025 Form 100S line 20 = 48210   from 2025/100S.pdf p3
  address on file: 1234 / 95814   corp 1234567
  Registration  https://webapp.ftb.ca.gov/MyFTBAccess/Registration/NewAccount
    read terms
    accept terms
    -> Continue
  ...
    company type = Corporation
    form type = 100S
    tax year = 2025
    declaration
    account number = 1234567
    net income = ••••
Dry run: stopped before the first Continue that sends anything to FTB.
```

Jane checks the values, then runs it with `--declare`. FTB texts a code; she types it at the prompt (or it is written to the code file). FTB answers with its confirmation, which matches the `registered` outcome; the runner writes the login to the vault, follows `then` to the `pin-letter` mail gate, keeps the card on the runner's own surface, and ends the run as waiting:

```
Registered: business MyFTB account jdoeb4k2x. FTB mails a PIN to the address on file.
  login saved to the ftb vault (profullstack/prod)
  PIN-letter card: pin-letter/7f3k2q (ftb status shows it)
  When the letter comes: ftb activate business --pin <PIN>
```

Had FTB answered "does not match our records", the run would have ended there with the 2024 figure listed as the next candidate, and nothing would have been retried.

## A second errand, sketched

The next errand planned is IRS.gov: sign in through ID.me and download account and return transcripts. It has not been run, and this fragment shows only what is new, the identity-proofing gate and the downloads:

```json
{
  "steps": [
    {
      "id": "id-me",
      "kind": "identity-proofing",
      "provider": "ID.me",
      "origins": ["https://api.id.me", "https://account.id.me"],
      "timeout": "PT30M",
      "handoff": "id-me",
      "why": "The IRS signs people in through ID.me, which may ask for a selfie or a video call. That is yours to do; the runner waits until you are back on irs.gov."
    }
  ],
  "outputs": {
    "downloads": [
      { "match": { "type": "application/pdf", "url": "transcript" }, "to": "~/Documents/irs/{{tax_year}}/transcript.pdf", "when": "downloaded" }
    ]
  }
}
```

## Schema

The JSON Schemas are `logicsrc-openerrand.schema.json` and `logicsrc-openerrand-index.schema.json` in [`@logicsrc/schemas`](https://github.com/profullstack/logicsrc/tree/master/packages/schemas/schemas), exported as `@logicsrc/schemas/openerrand` and `@logicsrc/schemas/openerrand-index`. `@logicsrc/validators` adds the checks a schema cannot express: step, gate, outcome and card references resolve, every `{{template}}` names an input, a shared secret is `secret`, and no card names a personal or secret input.

```
npx @logicsrc/validators openerrand ftb-register-business.json
```

## Not

**Not a way around a check.** There is no key for proxies, browser fingerprints, user agents or captcha solvers, and no gate a runner may perform. A site that wants a person gets one.

**Not for someone else's account.** The principal is the person running it or someone they represent with authority. An errand run against a stranger's records is the fraud the site's checks exist to stop.

**Not an API.** When a site has one, use it: [OpenConnection](/openconnection) for a token you paste, [OpenAccess](/openaccess) for a grant, [OpenSaaS](/opensaas) for the actions a subscription service publishes. An errand is for sites that offer a person a form and nothing else.

**Not a scraper.** An errand does one task for its principal and stops. It does not crawl, and it reads nothing the principal could not read in their own browser.

**Not a test framework.** Playwright and Selenium test a site its owner controls. An errand drives a site its publisher does not control, so it stops on anything it has not seen instead of failing a test.

**Not a credential store.** Logins go to a vault such as [OpenCreds](/opencreds); the errand file names keys, not values.

**Not legal or tax advice.** A declaration is the principal's statement, and an errand only carries it to the form.

## Relationship to other standards

- [OpenSaaS](/opensaas) describes each action as a `page` for a person and an `api` for an agent. An errand is what an agent does when there is only the `page`.
- [OpenCreds](/opencreds) is the vault `outputs.vault` writes to and `vault` sources read from.
- [OpenFleet](/openfleet) is the record an agent session carries; an agent running an errand runs it under that record, and the gates are where it hands back to its human.
- [OpenProfile.md](/openprofile) names the `publisher`.
- Selenium IDE's `.side` files and Playwright's recorded scripts replay clicks on selectors. An errand describes fields by meaning, with a fallback from id to label, so it survives a reworded page or stops on one, and it says which steps are a person's.
- The CNCF Open Workflow Specification (formerly Serverless Workflow) orchestrates services through their APIs. An errand drives a browser through pages; the two do not overlap, which is also why this is not called a workflow.

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-04 | First publication: the errand file, inputs with three sensitivity classes and seven sources, field rules matched by id then label, page and wait steps, five human gates (`declare`, `identity-proofing`, `code`, `mail`, `captcha`), outcomes, the never-retry rule for shared secrets, vault and download outputs, hand-off cards with no personal data, the publisher index at `/.well-known/openerrand.json`, thirteen runner rules, and the MyFTB business registration as the worked example. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
