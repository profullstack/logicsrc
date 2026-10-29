# OpenVuln

OpenVuln is one record per vulnerability that says, in one place, what is affected, whether it is fixed, whether anyone is exploiting it and who said each of those things. Every OpenVuln record is a valid [OSV](https://ossf.github.io/osv-schema/) record, so every OSV tool reads it today; what OpenVuln adds rides in OSV's own extension point, `database_specific.openvuln`. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of the records [nichedb.dev](https://nichedb.dev/c/vulns) assembles and serves, published so any researcher, vendor or scanner can serve them and any directory can read them.

Slug: `openvuln`

## The problem

The facts about one vulnerability live in five places that do not point at each other. OSV and GitHub say which package versions are affected. The NVD says how bad it is. CISA's KEV catalog says it is being exploited, and whether by ransomware crews. FIRST's EPSS says how likely exploitation is in the next thirty days. A research team says an AI agent turned it into a working exploit. Nobody holds all five, so a defender asking "should I patch this today" reads five sites and reconciles them by hand.

Worse, the vulnerabilities that matter most this year do not fit the formats. A prompt injection in a coding agent, a campaign that hijacks forty repositories to plant agent config files, a model that leaks its tools: OSV wants a package and a version range, CVE wants a vendor that answers email. These get a blog post and nothing a machine can read.

OpenVuln is the record that holds the five facts with a name on each, and a subject that can be an agent, a service or a campaign as well as a package.

## Terms

- A **publisher** serves OpenVuln records: a directory, a vendor, a research team, a scanner.
- A **record** is one vulnerability as one publisher knows it.
- A **subject** is what is vulnerable: a package, a product, a service, a repository, a model, an agent, hardware, a protocol, or a campaign that spans many of them.
- A **source** is where a fact in the record came from: OSV, the NVD, KEV, EPSS, a vendor advisory, a benchmark, the publisher's own research.

## The record

```json
{
  "schema_version": "1.6.0",
  "id": "NDB-2026-0002",
  "aliases": ["CVE-2026-12537", "GHSA-wpqr-6v78-jr5g"],
  "summary": "Gemini CLI runs commands from untrusted GitHub issue text in CI",
  "details": "Markdown: what it is, who is affected, how to check, how to fix.",
  "published": "2026-04-24T19:30:01Z",
  "modified": "2026-10-29T00:00:00Z",
  "severity": [{ "type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H" }],
  "affected": [
    {
      "package": { "ecosystem": "npm", "name": "@google/gemini-cli" },
      "ranges": [{ "type": "SEMVER", "events": [{ "introduced": "0" }, { "fixed": "0.39.1" }] }]
    }
  ],
  "references": [
    { "type": "ADVISORY", "url": "https://github.com/google-github-actions/run-gemini-cli/security/advisories/GHSA-wpqr-6v78-jr5g" },
    { "type": "ARTICLE", "url": "https://www.pillar.security/blog/my-agentic-trust-issues-from-prompt-injection-to-supply-chain-compromise-on-gemini-cli" }
  ],
  "credits": [{ "name": "Pillar Security", "type": "FINDER" }],
  "database_specific": {
    "openvuln": {
      "version": "0.1",
      "subject": { "kind": "agent", "name": "Gemini CLI", "vendor": "Google", "url": "https://github.com/google-gemini/gemini-cli" },
      "class": ["prompt-injection", "ci-cd"],
      "label": "critical",
      "fix": { "status": "fixed", "versions": ["0.39.1", "0.40.0-preview.3"], "workaround": "Do not run the agent with --yolo on untrusted issue or pull request text." },
      "exploitation": {
        "status": "poc-public",
        "kev": null,
        "epss": { "score": 0.00212, "percentile": 0.11456, "date": "2026-10-28" },
        "ai": []
      },
      "sources": [
        { "name": "OSV", "id": "GHSA-wpqr-6v78-jr5g", "url": "https://osv.dev/vulnerability/GHSA-wpqr-6v78-jr5g", "fields": ["affected", "severity", "aliases"], "retrieved": "2026-10-29T00:00:00Z" },
        { "name": "EPSS", "url": "https://api.first.org/data/v1/epss?cve=CVE-2026-12537", "fields": ["exploitation.epss"], "retrieved": "2026-10-29T00:00:00Z" }
      ],
      "deep_dive": { "url": "https://nichedb.dev/c/vulns/CVE-2026-12537", "made_by": "ai", "disclosure": "ai-generated", "ai_model": "claude-opus-5-5", "ai_provider": "Anthropic" }
    }
  }
}
```

Everything outside `database_specific.openvuln` is OSV, with OSV's meaning, and is not restated here. A record that leaves the `openvuln` block out is a plain OSV record, and a reader treats it as one with every OpenVuln field unstated.

## Rules

1. **`id`** is the publisher's own, with the publisher's prefix, as OSV requires (`NDB-` is nichedb.dev). A publisher that is only annotating someone else's vulnerability still mints its own id and lists the other in **`aliases`**. Two records are the same vulnerability when they share an id or an alias.
2. **`openvuln.version`** is `"0.1"`.
3. **`subject.kind`** is one of `package`, `product`, `service`, `repository`, `model`, `agent`, `hardware`, `protocol`, `campaign`. Absent means `package` when `affected` names one, and unstated otherwise. `subject` exists for what `affected` cannot hold: an agent, a hosted service, a set of hijacked repositories.
4. A **`campaign`** subject is one attacker's activity across many subjects. It lists them in **`subject.members`** (`[{ "kind", "name", "url" }]`) and their own records in OSV's `related`. The malicious packages of a campaign keep their own `MAL-` records; the campaign record ties them together.
5. **`class`** is a list of short slugs for the kind of flaw: `prompt-injection`, `supply-chain`, `malicious-package`, `auth-bypass`, `rce`, `memory-corruption`, `ci-cd`, `credential-exposure` and so on. A CWE goes in OSV's `database_specific.cwe_ids` as GitHub writes it; `class` is the plain word a reader filters by.
6. **`label`** is `critical`, `high`, `medium`, `low` or `none`. It is the publisher's own reading, from the CVSS base score where there is one (9.0 and up critical, 7.0 high, 4.0 medium, 0.1 low, 0 none). It never replaces `severity`, and a directory that computes it says so in `sources`.
7. **`fix.status`** is `fixed`, `partial`, `mitigated`, `unfixed`, `wontfix` or `unknown`. Absent is unknown, never fixed. **`fix.versions`** are the first fixed versions; **`fix.workaround`** is what to do before patching.
8. **`exploitation.status`** is the strongest statement any source makes: `exploited-ransomware` (KEV says known ransomware use), `exploited` (KEV, or a vendor or responder reporting attacks), `poc-public` (a working exploit is published or was demonstrated), `none-known`, or absent for unstated. `none-known` is a claim someone checked; absent is nobody said.
9. **`exploitation.kev`** is `{ "added", "due", "ransomware", "action" }` from CISA's catalog when the vulnerability is in it, and `null` when a reader checked and it is not. **`exploitation.epss`** is `{ "score", "percentile", "date" }`. EPSS moves daily, so the date is part of the value.
10. **`exploitation.ai`** lists evidence that an AI agent produced a working exploit: `[{ "benchmark", "task", "url", "result" }]`. `result` is `solved`, `unsolved` or `unstated`. A benchmark that only contains the task, with no published result, is `unstated`. That is a fact about the benchmark's corpus and is not evidence that an agent succeeded.
11. **`sources`** names where each part came from: `name`, the source's own `id`, a `url`, the record `fields` it supplied (dotted paths), and when it was `retrieved`. A fact with no source is the publisher's own.
12. **`deep_dive`** points at the long-form page. It carries the W3C AI Content Disclosure fields every LogicSRC spec uses: `made_by` (`human`, `ai`, `both`), `disclosure` (`none`, `ai-assisted`, `ai-generated`, `autonomous`), `ai_model`, `ai_provider`, `ai_prompt_url`. OSV's `details` is the same text, or a shorter one.

## Two rules that do not degrade

**No exploit code.** A record says that an exploit exists and links the page that published it. It never carries the code, the payload, the proof of concept or the steps. Indicators of compromise (a domain, a hash, a file path) are defensive and may be listed in OSV's `database_specific.iocs`, defanged.

**Every fact is attributed.** A severity, a KEV entry, an EPSS score or an "exploited" claim with no source is not an OpenVuln fact. A directory that merges sources keeps each fact's source. When two sources disagree, it keeps both and says which one it shows.

## Serving records

A publisher serves an index at `/.well-known/openvuln.json` on its own origin:

```json
{
  "openvuln": "0.1",
  "publisher": { "name": "nichedb.dev", "web": "https://nichedb.dev", "prefix": "NDB",
                 "operator": "https://profullstack.com/.well-known/openprofile.md" },
  "updated": "2026-10-29T00:00:00Z",
  "records": [
    { "id": "NDB-2026-0001", "modified": "2026-10-29T00:00:00Z", "url": "https://nichedb.dev/c/vulns/NDB-2026-0001.json" }
  ],
  "record_url": "https://nichedb.dev/c/vulns/{id}.json",
  "changes": "https://nichedb.dev/f/openvuln-records.json"
}
```

`records` lists the publisher's own records, newest `modified` first. `record_url` is a template for any id the publisher can answer for, including an alias, which is how a directory serves a merged record for a CVE it did not mint. A small publisher may put full records in `records` instead of `url` entries; a reader accepts either.

Records are TLP:CLEAR by definition. Anything embargoed is not served.

## Reading records

1. **Match on id and aliases.** A reader merging publishers treats every shared id or alias as one vulnerability and keeps each publisher's record whole.
2. **Believe the origin.** A record is the publisher's when it was fetched from the publisher's `web` origin. A copy hosted elsewhere is a claim about the publisher.
3. **Absent is unstated.** No `fix` is unknown, no `exploitation.status` is unstated, no `kev` is unchecked.
4. **Re-read daily.** KEV and EPSS move daily; a record read once is a snapshot.

## Related formats

- [OSV](https://ossf.github.io/osv-schema/) is the base. OpenVuln adds no top-level field. It only defines one key inside the extension point OSV reserves for databases, so `osv-scanner` and every OSV consumer keep working.
- [CVE JSON 5](https://github.com/CVEProject/cve-schema) is the CNA record. Its id goes in `aliases`.
- [CSAF 2.0](https://docs.oasis-open.org/csaf/csaf/v2.0/csaf-v2.0.html) and [OpenVEX](https://github.com/openvex/spec) are vendor statements about products. A CSAF advisory is a `references` entry of type `ADVISORY`; a VEX `not_affected` is a vendor's statement, not a `fix.status`.
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and [EPSS](https://www.first.org/epss/) are sources, copied into `exploitation` with their dates.
- [OpenThreat](/openthreat) is what one tool found in the open: a finding, an attack, an indicator. An OpenThreat `advisory` may point at an OpenVuln record in `refs`.

## What is deliberately absent

**No exploit detail.** Stated above.

**No risk score of our own.** `label` is a reading of CVSS, and EPSS is FIRST's. OpenVuln does not invent a number that combines them. A directory that ranks records says how.

**No affected-host data.** A record is about a vulnerability, never about who runs a vulnerable copy. Scan results are someone's private posture.

**No push.** A publisher serves files. A reader watches `updated` and `changes`.

## Related standards

- [OpenThreat](/openthreat): the same serve-your-own-file shape for a scanner's findings.
- [OpenProfile.md](/openprofile): the `operator` behind a publisher.
- [OpenMCP](/openmcp): a directory that also serves records over MCP describes that door with an OpenMCP descriptor.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-29 | First publication: the `database_specific.openvuln` block, nine subject kinds, twelve rules and the two that do not degrade, the publisher index, reading rules. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
