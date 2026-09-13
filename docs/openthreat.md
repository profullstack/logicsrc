# OpenThreat

OpenThreat is one file a security tool serves about what it found in the open: a finding in a public repository, an attack observed against the reporter's own infrastructure, an indicator worth blocking, an advisory. A directory reads the reporter's own file instead of a vendor's feed, a defender's agent reads it instead of a dozen dashboards, and the reporter stays the author of what it discloses and what it withholds. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file [ThreatCrush](https://threatcrush.com/discovery) serves and [nichedb.dev](https://nichedb.dev/c/threats) reads, published so any scanner or sensor can serve one and any directory can read it.

Slug: `openthreat`

## The problem

Every security tool finds things, and every one keeps what it found behind its own login. A scanner that runs on a thousand public repositories knows which rules fire most and where, and says nothing, because saying it would mean a feed, a schema, an API key and a sales call. The threat feeds that do exist are products: a licence per seat, terms that forbid redistribution, and a format each vendor invented. A defender wanting to know what is being found in the open, this week, by tools that are not theirs, cannot ask.

The tool already has the data, and for the open part of it there is no reason to hold it. What is missing is the one file that puts what a tool found in public where a reader can fetch it, with a rule for what may go in it.

## Terms

- A **reporter** is a tool or the operator of one: a scanner, a sensor, a daemon, a research team. Its **descriptor** is the file it serves.
- A **threat** is one thing the reporter found: a finding, an attack, an indicator or an advisory.
- A **subject** is what the threat is about: a public repository, a package, a host the reporter operates. A subject is never a private one.
- A **directory** is anything that reads descriptors across reporters: a threat index, a dashboard, a defender's cache.

## The descriptor

A reporter serves a JSON document at `/.well-known/openthreat.json` on its own origin.

```json
{
  "openthreat": "0.1",
  "reporter": {
    "name": "ThreatCrush",
    "web": "https://threatcrush.com",
    "operator": "https://profullstack.com/.well-known/openprofile.md",
    "tool": "threatcrush",
    "policy": "https://threatcrush.com/discovery#policy"
  },
  "updated": "2026-09-13T06:00:00Z",
  "threats": [
    {
      "id": "3f9a1c2b",
      "kind": "finding",
      "title": "SQL assembled by concatenation",
      "severity": "high",
      "confidence": "evidence",
      "rule": "js-sql-string-building",
      "cwe": "CWE-89",
      "category": "code",
      "subject": { "name": "northwind/api", "url": "https://github.com/northwind/api", "ref": "main", "commit": "9c1f0e2" },
      "location": { "file": "src/db/users.ts", "line": 42 },
      "status": "open",
      "first_seen": "2026-09-10T02:14:00Z",
      "last_seen": "2026-09-13T05:40:00Z",
      "message": "A query string is built from request input.",
      "consequence": "An attacker who controls the input controls the query.",
      "tlp": "clear"
    },
    {
      "id": "b71e0d44",
      "kind": "finding",
      "title": "Hardcoded credential",
      "severity": "critical",
      "rule": "secret-generic-credential",
      "cwe": "CWE-798",
      "category": "secret",
      "subject": { "name": "northwind/api", "url": "https://github.com/northwind/api" },
      "status": "open",
      "last_seen": "2026-09-13T05:40:00Z"
    },
    {
      "id": "ssh-91.232.105.3",
      "kind": "attack",
      "title": "SSH brute force",
      "severity": "medium",
      "rule": "ssh-bruteforce",
      "source": { "ip": "91.232.105.3", "country": "RU" },
      "target": { "port": 22, "service": "ssh" },
      "indicators": [{ "type": "ip", "value": "91.232.105.3" }],
      "status": "blocked",
      "first_seen": "2026-09-12T22:01:00Z",
      "last_seen": "2026-09-13T04:52:00Z",
      "count": 47
    }
  ]
}
```

The smallest valid descriptor is a reporter with a name and a threat with a title:

```json
{ "reporter": { "name": "ThreatCrush" }, "threats": [{ "title": "SSH brute force" }] }
```

The rules, and every one degrades except the two marked:

1. **`reporter.name` and `threats[].title` are the only required keys.** A reader lists what it was given and reports the rest as unstated.
2. **`reporter`** is who found it. `web` is the reporter's site, `tool` the name of the software, `operator` the person or organisation answerable as an [OpenProfile.md](/openprofile) URL, and `policy` the page that says what the reporter publishes and what it withholds. A reporter with a policy page is one a reader can hold to it.
3. **`updated`** on the descriptor is when anything in it last changed. A reader with it unchanged since its last fetch may skip the rest.
4. **`id`** is stable for as long as the threat is the same thing. It is the dedupe key. Absent, the reader derives one from `kind`, `subject.name`, `rule` and `title`, and a retitled threat becomes a new one.
5. **`kind`** is `finding` (something in a subject's code or configuration), `attack` (traffic observed against the reporter's own infrastructure), `indicator` (a value worth blocking or watching, on its own), or `advisory` (a statement about a vulnerability, with `refs`). Absent means `finding`.
6. **`severity`** is `info`, `low`, `medium`, `high` or `critical`. **`confidence`** is the reporter's own word for how sure it is, kept as written. **`rule`** is the reporter's stable rule identifier, the same string a SARIF `ruleId` carries. **`cwe`** is `CWE-` and a number. **`category`** is the reporter's own grouping.
7. **`subject`** is what the threat is about, and it is public by definition. `name` is the subject as the world knows it (`owner/repo`, a package name, a hostname the reporter operates), `url` where it lives, `ref` and `commit` what was looked at. **`location`** is `file` and `line` within the subject.
8. **`status`** is `open`, `fixed`, `mitigated`, `blocked` or `withdrawn`. `fixed` is a finding no longer present; `blocked` is an attack the reporter stopped; `withdrawn` is a threat the reporter retracted, kept in the file for a while so directories learn it was. Absent means `open`.
9. **`first_seen`**, **`last_seen`** are ISO 8601; **`count`** how many times it was observed between them. **`message`** says what was found and **`consequence`** what happens if it is real. **`refs`** are URLs: an advisory, a commit, a write-up.
10. **`source`** and **`target`** describe an attack: where it came from (`ip`, `asn`, `country`) and what it hit (`port`, `service`, `path`). **`indicators`** are values a defender can act on, each `type` (`ip`, `cidr`, `domain`, `url`, `hash`, `ua`) and `value`.
11. **`tlp`** is the Traffic Light Protocol label. A descriptor at `/.well-known/` is `clear` by definition, and a reader treats an absent `tlp` as `clear`. A reporter with anything else to say does not put it here.
12. **Unknown keys are kept.** A reporter says more than this document names, and a reader passes it through under the reporter's own key.

**The two rules that do not degrade.**

**A subject is public or it is not in the file.** A finding about a private repository, a customer's server, a paying user's scan, or anyone's infrastructure but the reporter's own is not a threat in the open; it is someone's private security posture, and publishing it is a breach. A reporter serves only what was already visible to anyone who looked: public repositories, public packages, its own hosts. A reporter that scans private things keeps two tables and serves one.

**A secret is never located while it is open.** A finding whose category is `secret`, or that the reporter marks sensitive, is published with its `rule`, `severity`, `subject` and `status` only: no `location`, no `message`, no excerpt. The credential is already exposed by being in a public repository; the file must not be the map to it. Once `status` is `fixed` the location may follow.

Serve it as `application/json`. The descriptor is a claim; that it came from the reporter's own origin is the verification.

## Announcing, and opting out

A subject that is scanned by a reporter's tool did not ask to be listed. The reporter's policy says how a subject's owner turns publication off, and the reporter honours it: a subject that opts out disappears from the file on the next build, and any threat about it already read by a directory is served once more as `withdrawn` so the directory retracts it too. Announcing is on by default, because a finding in a public repository is public already and a list nobody is on lists nothing; opting out is one switch, in the tool's own settings, and costs nothing.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/openthreat.json` on the reporter's origin.
2. `<link rel="openthreat" href="...">` in the HTML of the reporter's home page, or a `Link: <...>; rel="openthreat"` header, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `reporter.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the reporter by whoever hosts it, and a directory marks it so.

## Directories

A directory reading descriptors:

1. **Fetches hourly at least.** Threats are fixed, blocked and withdrawn on the hour; a file read once is a snapshot.
2. **Dedupes on the reporter's origin and the threat's `id`.** A re-read updates the row; it never adds a second. A `withdrawn` threat is retracted, not merely marked.
3. **Keeps the reporter's words and attributes the reporter.** Every listed threat says who found it and links the subject's `url`.
4. **Never adds what the reporter withheld.** A directory that fetches the subject and finds the secret the reporter declined to locate, and publishes the line, has broken the second rule on the reporter's behalf.
5. **Reports absence as absence.** No `status` is open. No `severity` is unstated, not low.

The first directory reading OpenThreat is the threats collection at [nichedb.dev](https://nichedb.dev/c/threats), which lists every reporter's threats as feeds, with RSS, JSON, an API and MCP over the same rows. The first reporter is [ThreatCrush](https://threatcrush.com/discovery), whose GitHub App scans public repositories and serves what it found.

## Related formats

- [SARIF](https://sarifweb.azurewebsites.net/) is what a scanner emits per run: `rule` here is SARIF's `ruleId`, and `location` its physical location. OpenThreat is the standing list across runs, with a subject and a status, and the disclosure rules SARIF does not have.
- [STIX 2.1](https://oasis-open.github.io/cti-documentation/) describes threat intelligence exhaustively. An `indicator` here maps onto a STIX Indicator, an `attack` onto a Sighting. OpenThreat is the small file a tool can serve in an afternoon; a directory that speaks STIX can translate.
- [CSAF](https://oasis-open.github.io/csaf/) is the vendor advisory format. An `advisory` here carries the CSAF document in `refs`.

## What is deliberately absent

**No private subjects.** Stated above and worth stating twice. The file is for what was found in the open.

**No exploit detail.** `message` says what was found; `consequence` says what it means. How to use it is nobody's business here.

**No scoring across reporters.** `severity` is the reporter's. A directory that ranks reporters or normalises severities labels the result as its own.

**No push.** A reporter serves a file. A directory that wants to be told may watch `updated`; a webhook is another document's business.

## Serving one

From the table the tool already keeps of what it found, filtered to public subjects, with secrets unlocated and opt-outs removed, at a fixed URL. ThreatCrush builds its file from the scans its GitHub App ran on public repositories, and nothing else.

## Related standards

- [OpenProfile.md](/openprofile): the `operator` behind a reporter.
- [OpenServer](/docs/openserver), [OpenCoupon](/docs/opencoupon): the same serve-your-own-file shape for a provider's catalog and a merchant's promotions.
- [OpenMCP](/openmcp): a directory that also serves its rows over MCP describes that door with an OpenMCP descriptor.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, four kinds, twelve rules and the two that do not degrade, announcing and opting out, discovery, what a directory owes a reporter. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
