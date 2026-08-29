# Importing from other products

OpenCreds is meant to be arrived at, not just left from. This page specifies the
mappings from the exports people actually have.

Every source below exports CSV, so the work is one correct CSV reader plus a
column mapping per product. The reader matters more than the mappings: a naive
`split(',')` mangles any export containing a note with a comma in it, which is
most of them.

## The reader

A conforming CSV reader MUST handle quoted fields, escaped quotes (`""`),
embedded newlines inside quotes, embedded commas, both CRLF and LF, and a
leading UTF-8 BOM. Chrome and Excel both emit a BOM, and unhandled it becomes
part of the first header name and breaks every column lookup in the file.

Header names are compared lowercased and trimmed, because column casing differs
between versions of the same product.

## Detection

An importer SHOULD identify the source from the header row so a person can drop
in a file without first telling us where it came from. Detection is ordered
most-specific first: Chrome's columns are a subset of 1Password's, so asking in
the wrong order misidentifies every Chrome export.

Order: `bitwarden`, `lastpass`, `keepass`, `onepassword`, `chrome`.

## Mappings

### Bitwarden

Header contains `login_uri` or `login_password`. Row `type` selects the item type.

| Bitwarden column | OpenCreds |
| --- | --- |
| `name` | `name` |
| `notes` | `notes` |
| `folder` | folder by name |
| `favorite` | `favorite` (`1` → true) |
| `login_username` | `login.username` |
| `login_password` | `login.password` |
| `login_totp` | `login.totp` |
| `login_uri` | `login.uris[0].uri`, `match: "domain"` |
| `card_*` | `card.*` |
| `identity_*` | `identity.*` |
| `type: securenote` | `note` |

### 1Password

Header contains `url`, `username` and `type`.

| 1Password column | OpenCreds |
| --- | --- |
| `title` | `name` |
| `url`/`website` | `login.uris[0].uri` |
| `username`, `password` | `login.*` |
| `otpauth` | `login.totp` |
| `notes` | `notes` |

### Chrome

Header contains `url`, `username`, `password`. Logins only.

| Chrome column | OpenCreds |
| --- | --- |
| `name` | `name`, falling back to the URL host |
| `url` | `login.uris[0].uri` |
| `username`, `password` | `login.*` |
| `note` | `notes` |

### LastPass

Header contains `url` and `grouping`. LastPass writes `http://sn` in `url` for
secure notes, which is the only reliable way to tell one from a login.

| LastPass column | OpenCreds |
| --- | --- |
| `name` | `name` |
| `grouping` | folder by name |
| `url` | `login.uris[0].uri`, unless `http://sn` |
| `username`, `password` | `login.*` |
| `totp` | `login.totp` |
| `extra` | `notes` |
| `fav` | `favorite` |

### KeePass (CSV export)

Header contains `account` and `login name`, or `group` and `password`.

| KeePass column | OpenCreds |
| --- | --- |
| `account`/`title` | `name` |
| `login name`/`user name` | `login.username` |
| `password` | `login.password` |
| `web site`/`url` | `login.uris[0].uri` |
| `comments`/`notes` | `notes` |
| `group` | folder by name |

## Rules that apply to every importer

**Report, never drop.** A row that cannot be mapped is returned in a `skipped`
list with its row number and a reason. An import that silently loses credentials
is worse than one that says what it could not read — the person still has the
source file, and only knows to go back for it if they are told.

**Name from the host when the export had none.** Chrome in particular writes
rows with an empty name; `github.com` is a better label than a blank line.

**An empty row is not a failure.** A login with no username, no password and no
name is a trailing blank line. It is skipped with the reason `Empty row`, which
is different from `could not map` and should read differently in a report.

**Nothing here touches crypto or the network.** An importer turns text into
plain item objects. The caller encrypts them. That separation is what lets the
same importer run in a browser extension's service worker and in a CLI.

## Going the other way

`opencreds export --format bitwarden-csv` writes a Bitwarden-shaped CSV, because
that is the format most other products import best. It is a plaintext export and
carries every warning that implies — see
[database.md](./database.md#the-plaintext-form).

The lossy fields are named in the output rather than discovered later: password
history, custom fields, attachments, URI match rules, `key` items and `account`
items have no column in any product's CSV. The CLI prints what it dropped and
the count for each.
