# OpenPkg

OpenPkg is an open, implementation-neutral format for installing command-line software from the websites that publish it and keeping all of it current with one command. It defines a package identity, a repository profile on The Update Framework (TUF), four JSON documents a repository serves, the rule a catalog of third-party installers follows, what a client must do when it installs, updates, rolls back and removes, and the one JSON result a client prints for a machine to read. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **1.0 Draft**, October 12, 2026. Written from the code of W3BS Package Manager (`w3bs`), which is the reference implementation, so every field and rule below is one a working client and publisher tool already read and write.

Slug: `openpkg`

## Why

Most command-line tools ship as `curl -fsSL https://example.com/install.sh | sh`. That is a fine way to get a tool once and a poor way to own twenty of them: each script puts files somewhere different, none of them knows what the others installed, an update means finding the script again, and nothing can say which version is on the machine or put the last one back when a release is bad. Language package managers solve this inside one ecosystem and stop at its edge; operating-system package managers solve it for the distribution's maintainers, not for the publisher of a tool.

The pieces for something better exist. TUF already says how to sign a static file tree so a client can detect tampering, rollback and freeze attacks, and static hosting is enough to serve one. What is missing is the agreement on top: how a package is named, which files a repository serves and what is in them, how a catalog lists tools that only have a curl installer without pretending it can verify them, and what a client promises about the machine it changes. OpenPkg is that agreement, written so a second client or a second publisher tool can be built from this page alone.

## Relationship to W3BS

[W3BS Package Manager](https://w3bs.org/docs/package-manager.md) is where the manager and the catalog live: the `w3bs` client, the `w3bs-publish` publisher tool, the signed W3BS repository and the [package catalog](https://w3bs.org/packages). OpenPkg is the format they speak. The reference implementation is [`package-manager/` in profullstack/w3bs.org](https://github.com/profullstack/w3bs.org/tree/main/package-manager); the user and publisher guide derived from its product requirements is [w3bs.org/docs/package-manager.md](https://w3bs.org/docs/package-manager.md).

Nothing in this specification requires W3BS. A repository built to it can be read by any conforming client, and a conforming client can be pointed at any conforming repository.

## Conventions

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.

All documents are UTF-8 JSON. Unknown fields in a document MUST be ignored unless this specification says otherwise. Versions are Semantic Versioning 2.0.0.

## Terms

- A **publisher** is whoever builds a package and signs the repository it is served from.
- A **repository** is a static file tree served over HTTPS: TUF metadata and the targets it signs.
- A **target** is any file the repository's `targets` metadata names, with its length and SHA-256.
- A **package** is one named piece of software with one or more releases.
- A **release** is one version of a package, described by one release manifest.
- An **artifact** is the file a release ships for one platform: an archive or a single executable.
- A **command** is a name the client puts in the user's bin directory, linked to a file inside an artifact.
- A **catalog entry** is a tool listed by a repository that installs with its publisher's own curl installer.
- A **client** is the program that reads repositories and changes the user's machine.
- A **transaction** is one client invocation that changes state, with one `transaction_id`.

## 1. Package identity

### 1.1 Grammar

A package identity is `<publisher-host>/<name>`, ASCII only, with exactly one `/`.

```
package-id     = publisher-host "/" name
publisher-host = label 1*( "." label )          ; at least one dot, at most 253 chars
label          = 1*63( %x61-7A / DIGIT / "-" )  ; lowercase, no leading or trailing "-"
name           = ( %x61-7A / DIGIT ) *63( %x61-7A / DIGIT / "-" / "_" )
```

`tools.example/atlas` and `anthropic.com/claude-code` are identities. `atlas`, `localhost/atlas`, `Tools.example/atlas`, `tools.example/Atlas`, `tools.example/a/b`, `tools..example/atlas` and any identity containing a non-ASCII character (a Cyrillic `о` for a Latin `o`, for example) are not. A client MUST reject an identity that does not match the grammar, wherever it appears.

A user MAY type a bare name (`atlas`). A client resolves it against the repositories the user has added; when more than one offers that name it MUST stop and ask the user to name one, and MUST NOT pick one.

### 1.2 The host is a namespace label

The publisher host keeps two publishers' names apart. It is never evidence of who signed anything. A client MUST NOT treat a package as authorized by the owner of the domain in its identity; authority comes only from the repository trust root the installation is bound to (section 2). A repository MAY serve packages under any publisher host.

### 1.3 Command names

A command name is 1 to 64 characters of `A-Z`, `a-z`, `0-9`, `-`, `_` and `.`, and MUST NOT start with `.` or `-`. A command name therefore cannot contain `/`.

### 1.4 Reserved commands

The manager owns its own commands. In this version they are `w3bs` and `w3bs-publish`; a client that is not W3BS reserves its own command names the same way and SHOULD reserve these as well. A manifest or catalog entry for any package other than the manager MUST NOT claim a reserved command, and a client MUST reject one that does. The manager's own identity is `w3bs.org/w3bs`.

### 1.5 Relative paths

Every path inside a document (a target path, a command target, a manifest path, an archive entry) MUST be relative and safe. A safe relative path:

- is 1 to 1024 characters;
- does not start with `/`;
- contains no `\` and no control character;
- has no empty component, no `.` component and no `..` component, so `bin//x`, `./bin` and `bin/../../etc` are all rejected.

A client MUST reject a document or archive containing a path that is not safe, and MUST NOT build a filesystem path by joining an untrusted name; it derives storage keys from validated identities instead.

## 2. Repository profile

### 2.1 TUF 1.0

A repository is a TUF 1.0 repository (`spec_version` `1.0.0`) with the four top-level roles `root`, `targets`, `snapshot` and `timestamp`. Profile 1, which this version defines, has these constraints:

- One ed25519 key per role, threshold 1, is allowed. A publisher MAY use more keys and higher thresholds.
- `consistent_snapshot` MUST be `false`.
- No delegated targets roles are required; a client MAY refuse them.
- Metadata is served at `<base>/metadata/`: `1.root.json`, `root.json` (the latest root), `targets.json`, `snapshot.json`, `timestamp.json`.
- Targets are served at `<base>/targets/`, under the target paths the `targets` metadata names.

`<base>` is an `https://` URL with no credentials in it. A client MUST verify every target it reads against signed `targets` metadata (length and SHA-256) before using a byte of it, and MUST apply TUF's checks for expired metadata, rollback of version numbers and freeze. Version counters persist per repository and MUST NOT go backwards, including after the user removes and re-adds the repository.

A client SHOULD cap what it reads: the reference client accepts at most 1 MiB for a root and 4 MiB for an index, channel index or manifest.

### 2.2 First-use trust by root fingerprint

A repository's identity is its first root. Its fingerprint is

```
sha256:<lowercase hex SHA-256 of the exact bytes of metadata/1.root.json>
```

When a user adds a repository, the client fetches `metadata/1.root.json`, checks that it is a TUF root signed by its own root keys, shows the fingerprint and asks the user to trust it. That decision pins the publisher's keys for every later update, and root rotation proceeds by TUF's chain from that root. A client:

- MUST NOT trust a root the user has not approved, either interactively or by an expected fingerprint (`--root-fingerprint`) or root file supplied out of band;
- MUST NOT accept an unknown root because of a blanket approval flag alone (`--yes` without a fingerprint is not approval of a root);
- MUST read prompts from the terminal, never from a pipe, so a script cannot answer them;
- MUST treat each repository as its own trust domain: trusting one publisher never trusts another.

### 2.3 Publishing order

A publisher writes targets before metadata, and `timestamp.json` last, so a client never sees metadata naming a file that is not there yet. Concretely: copy every target into `<base>/targets/`, then install `targets.json`, then `snapshot.json`, then `timestamp.json`, each by an atomic rename. A publisher SHOULD re-sign before metadata expires; the reference tool's defaults are 365 days for targets, 90 for snapshot and 30 for timestamp.

### 2.4 Workspace (informative)

The reference publisher tool, `w3bs-publish`, keeps a workspace laid out like this. Only `repo/` is published.

```
<workspace>/
  keys/{root,targets,snapshot,timestamp}.pk8   ed25519 PKCS#8, 0600, never published
  staging/                                      the target tree a publisher edits
    manifests/<name>/<version>.json            the immutable release ledger
    artifacts/<name>/<version>/<file>
    catalog/index.json                          optional curl catalog
    revocations.json                            optional, not published as a target
  repo/                                         serve this directory over HTTPS
    metadata/{1.root.json,root.json,targets.json,snapshot.json,timestamp.json}
    targets/...                                 staging plus the generated indexes
```

The package index and channel indexes are generated from the manifests on every build, so they cannot disagree with the ledger.

## 3. Targets

Four documents live in the target tree. Each carries `schema_version`, currently `"1.0"`. A client MUST reject a document whose major schema version it does not understand: an unknown major fails closed.

Parsing a document proves nothing about where it came from; only its verification as a TUF target does.

### 3.1 Package index: `packages/index.json`

What a repository offers. These are candidates for resolution, not a claim of ownership.

```json
{
  "schema_version": "1.0",
  "packages": [
    {
      "id": "tools.example/atlas",
      "name": "atlas",
      "description": "Atlas CLI",
      "channels": {
        "beta": "channels/atlas/beta.json",
        "stable": "channels/atlas/stable.json"
      }
    }
  ]
}
```

| field | rule |
| --- | --- |
| `id` | A package identity (section 1.1). |
| `name` | The identity's name part. |
| `description` | Optional text. |
| `channels` | Channel name to channel-index target path. Each path MUST be safe (section 1.5). |

A channel name is 1 to 32 characters of `a-z`, `0-9` and `-`. `stable` is the default channel.

### 3.2 Channel index: `channels/<name>/<channel>.json`

The releases on one channel, and the revocations for the package.

```json
{
  "schema_version": "1.0",
  "package_id": "tools.example/atlas",
  "channel": "stable",
  "releases": [
    { "version": "1.2.3", "manifest": "manifests/atlas/1.2.3.json" },
    { "version": "1.3.0", "manifest": "manifests/atlas/1.3.0.json" }
  ],
  "revoked": [
    {
      "sha256": "9f2c4e0b7a1d3c5e8f6a2b4d0c1e3f5a7b9d2c4e6f8a0b1c3d5e7f9a2b4c6d8e",
      "reason": "crashes on start on macOS 11"
    }
  ]
}
```

A revocation names an artifact digest. A client MUST refuse to activate an artifact whose SHA-256 is in `revoked`. **Omission is not revocation**: a release that disappears from `releases` is no longer offered, but an installation of it is not treated as revoked unless its digest is listed. A publisher who wants a release out of service MUST list its digests in `revoked`.

### 3.3 Release manifest: `manifests/<name>/<version>.json`

One release. This is the reference implementation's own test fixture.

```json
{
  "schema_version": "1.0",
  "package": {
    "id": "tools.example/atlas",
    "name": "atlas",
    "description": "x",
    "license": "MIT"
  },
  "release": {
    "version": "1.2.3",
    "channel": "stable",
    "published_at": "2026-10-12T12:00:00Z"
  },
  "requirements": {
    "manager": ">=0.1.0, <0.2.0",
    "capabilities": []
  },
  "artifacts": [
    {
      "platform": "aarch64-apple-darwin",
      "target_path": "artifacts/atlas/1.2.3/atlas-aarch64-apple-darwin.tar.gz",
      "format": "tar.gz",
      "length": 5,
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "unpacked_size_limit": 100,
      "commands": { "atlas": "bin/atlas" }
    }
  ]
}
```

| field | rule |
| --- | --- |
| `package.id` | A package identity. |
| `package.name` | MUST equal the identity's name part. |
| `package.description`, `package.license` | Optional text. The license SHOULD be an SPDX expression. |
| `release.version` | A semantic version. |
| `release.channel` | A channel name. A prerelease version MUST NOT be published to `stable`. |
| `release.published_at` | RFC 3339 UTC timestamp. |
| `requirements.manager` | Optional semver requirement on the client, e.g. `>=0.1.0, <0.2.0`. A client that does not satisfy it MUST NOT install the release. |
| `requirements.capabilities` | Capabilities the release needs from the client. A client MUST refuse a release that requires any capability it does not support. Version 1.0 defines none, so any non-empty list fails closed in a 1.0 client. |
| `artifacts` | At least one. At most one per `platform`. |
| `artifacts[].platform` | A target triple such as `x86_64-unknown-linux-gnu` or `aarch64-apple-darwin`. |
| `artifacts[].target_path` | A safe relative path to the artifact target. |
| `artifacts[].format` | `tar.gz` or `binary`. A `binary` artifact is one executable and maps exactly one command. |
| `artifacts[].length` | Bytes, greater than zero. MUST match the signed target. |
| `artifacts[].sha256` | 64 lowercase hex characters. MUST match the signed target. |
| `artifacts[].unpacked_size_limit` | Greater than zero. A client MUST stop extracting once the unpacked size passes it. |
| `artifacts[].commands` | At least one. Command name (section 1.3) to a safe relative path inside the artifact. |
| `extensions` | Optional object. Keys are namespaces; a client MAY read them and MUST NOT execute anything from them. |

A manifest has no install hooks, no scripts and no post-install step. Installing a release is extracting verified bytes and linking commands, nothing else.

When extracting a `tar.gz` artifact, a client MUST reject entries with unsafe paths and links that resolve outside the version directory.

### 3.4 Curl catalog: `catalog/index.json`

Tools that install with their publisher's own curl installer, listed by a signed repository.

```json
{
  "schema_version": "1.0",
  "entries": [
    {
      "id": "moshcode.sh/moshcode",
      "name": "moshcode",
      "title": "moshcode",
      "description": "Wrapper CLI that installs and drives coding agents such as opencode, Claude Code and codex.",
      "commands": ["moshcode", "moshscript"],
      "install": { "url": "https://moshcoding.com/install.sh", "shell": "sh" },
      "homepage": "https://moshcode.sh",
      "repository": "https://github.com/moshcoder/moshcode",
      "vendor": "Profullstack",
      "license": "MIT",
      "agentic": true
    }
  ]
}
```

| field | rule |
| --- | --- |
| `id` | A package identity. |
| `name` | MUST equal the identity's name part. |
| `title` | Optional display name, such as `Claude Code` for `anthropic.com/claude-code`. |
| `description` | Optional text. |
| `commands` | The commands the installer is documented to provide. Each MUST be a valid, unreserved command name. |
| `install.url` | REQUIRED. A plain `https://` URL, with no whitespace or control characters. |
| `install.shell` | `sh` or `bash`. Defaults to `sh`. |
| `homepage`, `repository`, `vendor`, `license` | Optional. |
| `agentic` | Boolean, default `false`: the tool is a coding agent or drives one. |

The equivalent command a person would paste is `curl -fsSL <install.url> | <install.shell>`.

## 4. The listing rule for catalogs

A catalog is how a client offers tools that have no signed repository. It works only if it is strict about what it runs.

1. A catalog entry MUST have an `https://` curl installer. No installer, no listing.
2. A client MUST run only that installer for a catalog entry: fetch `install.url` itself over HTTPS, keep a copy with its SHA-256, run it with `install.shell`, and record the result. Updating an entry is running its installer again.
3. A client MUST NOT invoke npm, pip, brew, cargo or any other package manager directly on a catalog entry's behalf. The installer script MAY use any tool internally; that is the publisher's choice, inside the publisher's script.
4. A client MUST disclose, before running a catalog installer and in its inventory afterwards, that the installer is the publisher's, that the client does not own the files it writes, and that it cannot verify or roll them back. Removing a catalog entry unregisters it and points the user at the publisher's uninstall steps; it MUST NOT delete files the client did not write.
5. A client SHOULD cap the installer's size (the reference client allows 4 MiB) and MUST refuse an empty one.

The catalog entry itself is a signed target, so its identity and installer URL are authenticated by the repository. The script at that URL is not.

## 5. Client lifecycle

### 5.1 Published versions are immutable

A version, once published, binds each of its platforms to one artifact digest. A publisher tool MUST refuse to publish the same version again with different bytes. A client that has seen a version and platform bound to one digest MUST refuse a later manifest that binds them to another (`IMMUTABILITY_VIOLATION`), and MUST verify the artifact against the signed digest before activating it.

### 5.2 Version policy

- **Stable by default.** A fresh install selects the highest release on `stable`. Prereleases are considered only on a channel the user selected explicitly.
- **Compatible updates.** An update stays within the installed major version; for a `0.x` version it stays within the installed minor, because `0.1` to `0.2` is breaking. The newest compatible release wins.
- **`--allow-major`.** Widens the boundary to the newest release on the channel. It never admits a prerelease on `stable` and never overrides a pin.
- **Held.** When a newer release exists only across the boundary, the package is reported `held`, which is not an error.
- **Pins are binding.** A pinned package is never updated by a general update; it is reported `pinned`.
- **No silent downgrade.** A client MUST NOT select a version lower than the installed one during an update. An explicit request to install a version lower than the installed one MUST be refused; returning to the retained previous version is rollback (section 5.4).

### 5.3 Atomic per-package activation

Each package is activated on its own, and an interrupted run leaves it at the previous committed installation or the verified new one, never a mix. A conforming client keeps a journal per package and follows this order of durable steps:

1. extract and verify into a staging directory, synced to disk;
2. write the journal: the old target, the new target and the command links;
3. rename staging into an immutable version directory keyed by version and digest;
4. swap the package's `current` link;
5. swap the command links in the user's bin directory;
6. commit the state database;
7. write the receipt and delete the journal.

On the next run that changes state, before anything else, the client reconciles every journal: if committed state already names the new version, it rolls forward; otherwise it restores the committed state. A dry run MUST refuse to plan while unresolved journals exist. Only one client may change state at a time; a second one MUST stop with exit code 5 rather than wait silently.

### 5.4 Rollback restores files only

Rollback re-activates the retained previous version and pins the package to it. It changes application files and command links only. It MUST NOT claim to roll back configuration, databases, caches or migrations, and a client MUST say so before it acts.

### 5.5 Removal removes only owned files

A client removes only files it wrote: the package's version directories and the command links it created. User configuration and data are kept. A client MUST NOT overwrite or remove a command link it does not own, and MUST report a `conflict` instead.

### 5.6 Receipts are views of committed state

A receipt is an exportable JSON view of one installation. The client's state database is the source of truth, and a receipt MUST NOT describe an installation that has not been committed.

```json
{
  "schema_version": "1.0",
  "package_id": "tools.example/atlas",
  "owner": "w3bs",
  "installed_version": "1.2.3",
  "platform": "aarch64-apple-darwin",
  "repository_id": "tools",
  "root_fingerprint": "sha256:4b8e0f2a6c1d9e3b7a5f0c2d4e6b8a1c3f5d7e9b0a2c4e6f8d1b3a5c7e9f0b2d",
  "artifact_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "installed_at": "2026-10-12T12:00:00Z",
  "channel": "stable",
  "update_policy": "compatible",
  "pinned_version": null,
  "previous_version": "1.2.2",
  "commands": ["atlas"],
  "transaction_id": "txn-1792152000000-4242",
  "origin": "native"
}
```

`origin` is diagnostic only: `native` when the installation was made by the client directly, `curl` when a publisher's generated installer handed off to it. It never changes ownership or security guarantees.

## 6. Machine interface

### 6.1 One result object

With `--json`, a client prints exactly one JSON object on stdout per invocation, and nothing else there.

```json
{
  "schema_version": "1.0",
  "operation": "update",
  "result": "partial_failure",
  "transaction_id": "txn-1792152000000-4242",
  "packages": [
    { "id": "tools.example/atlas", "from": "1.2.3", "to": "1.3.0", "status": "updated" },
    { "id": "labs.example/orbit", "from": "0.4.1", "to": null, "status": "held", "reason": "0.5.0 is a breaking update; pass --allow-major" },
    {
      "id": "tools.example/relay",
      "from": "2.0.0",
      "to": "2.0.1",
      "status": "failed",
      "error": { "code": "DIGEST_MISMATCH", "message": "artifact digest does not match signed metadata", "retryable": false }
    }
  ]
}
```

| field | rule |
| --- | --- |
| `schema_version` | `"1.0"`. |
| `operation` | The verb that ran, such as `install`, `update`, `remove`, `rollback`. |
| `result` | One of `ok`, `partial_failure`, `failure`, `approval_required`, `invalid_arguments`, `preflight_failure`, `locked`. |
| `transaction_id` | The transaction's id, or `null` when nothing changed state. |
| `packages` | One outcome per package touched. Omitted when empty. |
| `packages[].id`, `from`, `to` | Identity, and the versions before and after (`null` when there is none). |
| `packages[].status` | One of `installed`, `updated`, `removed`, `current`, `pinned`, `unpinned`, `held`, `blocked`, `failed`, `unknown`, `planned`, `rolled_back`, `skipped`, `conflict`. |
| `packages[].reason`, `packages[].error` | Optional. |
| `data` | Optional operation-specific payload: an inventory, search hits, repository information. |
| `error` | `{ "code", "message", "retryable" }` for a global failure. `code` is an upper-case stable identifier such as `ROOT_FINGERPRINT_MISMATCH` or `METADATA_EXPIRED`. |
| `warnings` | Optional list of strings. |

When there is no global error, `result` is derived from the outcomes: `ok` when none is `failed`, `conflict` or `blocked`; `failure` when every one is; `partial_failure` otherwise.

### 6.2 Exit codes

| code | meaning |
| --- | --- |
| `0` | OK. Being current, pinned or held is not an error. |
| `1` | A package operation failed (`failure` or `partial_failure`). |
| `2` | Invalid arguments, an ambiguous name or invalid configuration. |
| `3` | Approval or a trust decision is required. |
| `4` | A global security, state or environment preflight failed. |
| `5` | Another client holds the mutation lock. |
| `130` | Interrupted. |

## 7. Security considerations

**The curl bootstrap is outside the trust model.** The first script a user pipes to a shell runs as that user before any client can verify anything, and any checksum or fingerprint inside it arrives in the same response as the script. Those values catch corruption and mix-ups, not a malicious server. A bootstrap script SHOULD do nothing until its last line, so a truncated download does nothing; SHOULD restrict curl to HTTPS for the request and every redirect (`--proto '=https' --proto-redir '=https'`); and SHOULD hand off to a verified client as soon as it can. Everything after that hand-off is verified against signed metadata. Users who want to look first can download, read and then run it, and CI SHOULD download then run so a failed download cannot look like success.

**TLS is not authorization.** HTTPS protects the transport. It says nothing about whether the server's files were signed by the publisher the user trusted. A client MUST authorize targets by TUF signatures from the pinned root and MUST NOT treat a valid certificate for the publisher host as permission to install.

**First-use trust is not identity proof.** Approving a root fingerprint pins whoever controlled the repository at that moment. It does not prove who that is. A user who needs that assurance compares the fingerprint through a separate channel, or supplies it with `--root-fingerprint`.

**Catalog installers are unverified.** Section 4 authenticates the listing, not the script. A client MUST say so every time it runs one.

**The manager is pinned to a fixed path.** A client or bootstrap MUST NOT trust a binary of the manager's name found on `PATH`; it uses the managed copy at its own fixed location.

**No hooks.** Because a release manifest cannot carry scripts, installing a signed package never runs publisher code. Extensions are data.

## 8. Conformance

A conforming **repository** serves the profile in section 2 and documents that validate under section 3. A conforming **client** meets every MUST in sections 1 to 7 for the operations it offers. A conforming **publisher tool** produces conforming repositories, refuses to change a published version, and follows the publishing order in section 2.3.

W3BS Package Manager is the reference implementation: [`package-manager/` in profullstack/w3bs.org](https://github.com/profullstack/w3bs.org/tree/main/package-manager), with the schema in `crates/w3bs-schema`, the client engine in `crates/w3bs-core`, the publisher tool in `crates/w3bs-publish` and the bootstrap in `bootstrap/install.sh`. Its test suite, the unit tests in each crate and the end-to-end tests in `crates/w3bs-cli/tests`, is the conformance test suite for this version. Where this text and the reference implementation disagree, file an issue; the text is corrected or the implementation is, and the version history records which.

Anyone may implement OpenPkg, as a client, a publisher tool or a repository, without permission and without using the W3BS name.

## Not

**Not a build system.** A publisher builds artifacts however it likes; OpenPkg starts at the finished file.

**Not a language package manager.** No dependency resolution between packages, no libraries, no lockfiles. A package is a self-contained program.

**Not a system package manager.** Packages install per user, under the user's home, without root.

**Not a hosting service.** A repository is a static directory on any HTTPS host.

## Relationship to other standards

- [TUF](https://theupdateframework.io/) 1.0 is the security layer. OpenPkg profile 1 is a constrained use of it, plus the documents TUF leaves to the application.
- [OpenInstall](/openinstall) is the script that puts a server application into service on the box it runs on. OpenPkg is how a person installs and updates command-line tools on their own machine. A tool can use both.
- [OpenStack.md](/openstack) says what a project is built on; a command-line project can list OpenPkg there as the way it ships.
- Homebrew, Scoop and npm global installs cover overlapping ground inside their own ecosystems. OpenPkg is publisher-hosted and ecosystem-neutral, and a publisher needs no one's approval to run a repository.

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 Draft | 2026-10-12 | First publication: package identity, TUF repository profile 1 with first-use trust by root fingerprint, the package index, channel index, release manifest and curl catalog, the catalog listing rule, client lifecycle rules, receipts, the JSON result object and exit codes, with W3BS Package Manager as the reference implementation. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
