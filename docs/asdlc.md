# ASDLC

ASDLC is the **Agentic Software Development Lifecycle**: an open description of how software gets built when most of the work is done by agents running in parallel, and CI/CD is the only gate that matters. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

The traditional SDLC assumes the scarce resource is engineering time, so it spends process on making sure each change is worth building. When agents write the code, engineering time stops being scarce and two other things become scarce instead: **human attention** and **trunk stability**. ASDLC is what a lifecycle looks like when you optimise for those two instead.

Status: **0.1**. This is a description of a practice already in production, published so others can copy it, not a proposal.

## What actually changes

| | SDLC | ASDLC |
|---|---|---|
| Unit of work | a ticket, worked serially | a concern, worked in parallel by N agents |
| Isolation | a branch per developer | a worktree per agent, on one checkout |
| Gate | code review by a person | a program: typecheck, tests, CI, release guards |
| Test environment | staging, then prod | prod, because staging lies |
| Definition of done | merged | verified live and announced |
| Response to an escape | a postmortem | a permanent automated check |
| Cost of a release | high, so releases are batched | near zero, so releases are continuous |

The row that carries the most weight is the last one. Everything else in ASDLC follows from making a release cheap enough that shipping four times in a day is unremarkable.

## The nine phases

```txt
Frame → Fan out → Gate locally → Merge → Release → Verify live → Correct → Ratchet → Promote
                     ↑                                              ↓
                     └──────────────────────────────────────────────┘
```

### 1. Frame

A human states intent. The agent restates the scope before acting, and names anything it is deliberately leaving out. Framing is the phase humans should spend their attention on, because it is the only one where being wrong is expensive.

### 2. Fan out

Work is split into concerns that do not share files, and one agent takes each. Every agent MUST get its own working tree. Agents run concurrently, and a session does not wait on another session.

### 3. Gate locally

Before anything is pushed, the agent MUST run the project's own checks: typecheck, tests, lint, and any smoke check the repo ships. This is not a duplicate of CI. CI failing on trunk breaks the deploy for everyone, so the local gate exists to keep the shared pipeline green rather than to prove the change works.

### 4. Merge

Merge to trunk. Do not park a pull request waiting for review that is not coming. A PR that sits open is a change that is not deployed, and an undeployed change has not been tested by anything real.

### 5. Release

Cut the release as part of the same unit of work, not as a follow-up. In any project where users install artifacts or pull a published package, a merge to trunk reaches nobody. Merged is a midpoint. Released is not the finish line either (see phase 6), but unreleased work is invisible work.

### 6. Verify live

Confirm the deployment is actually serving the change. A green pipeline is evidence that a build succeeded, not that the thing users load has changed. Check the running deployment's status, then look for a marker of the change in the live asset.

### 7. Correct

Prod is the test environment. When something is wrong, it returns to phase 2 as a new fan-out, not to a planning meeting. The loop from a failure back to a fix in production is measured in minutes, and that speed is the whole reason the loop is allowed to be the test.

### 8. Ratchet

**Every escape MUST become a permanent automated check before the incident is closed.** This is the load-bearing phase, and the one that separates ASDLC from shipping carelessly and calling it a methodology. Testing in prod is only defensible if prod failures are one-time events. A fix without a ratchet is how the same class of bug ships three times.

A ratchet is not a note in a document. It is a program that fails, in CI or in the local gate, when the bug comes back. The test for a ratchet is whether it actually fails when you reintroduce the bug, and that MUST be confirmed rather than assumed.

### 9. Promote

Announce the change: socials, a blog post if it deserves one, a release note. Work nobody hears about did not ship in any sense the business recognises. Promotion is a phase of the lifecycle, not a marketing follow-up, and a unit of work is not done until it has run.

## Invariants

These are the properties that make the loop safe. A practice that skips them is not ASDLC, it is just moving fast.

1. **Isolation before parallelism.** N agents on one checkout corrupt each other. N agents on N worktrees do not. Anything shared across worktrees (in git, the stash stack is one example) is a hazard and MUST be treated as one.
2. **The gate is a program, not a person.** Every rule a reviewer would enforce is written as a check that runs without being asked. A rule that lives only in someone's head is not enforced at agent throughput.
3. **The tooling refuses, rather than warns.** A release script that warns about a dirty tree gets ignored. One that exits non-zero cannot be.
4. **Prod is the only honest environment.** Reproduce the real conditions or accept that your test proves nothing. See the worked example below for a failure that no local server could reproduce, by construction.
5. **Verified live, not merged, is done.**
6. **Every escape ratchets.**

## Conformance levels

A team can claim a level. Each level includes the ones below it.

- **Level 0, serial.** Agents are used, one at a time, and a human reviews and merges each change. Most teams calling themselves AI-assisted are here.
- **Level 1, isolated.** Agents work in parallel in isolated trees. The local gate is defined and runs before every push.
- **Level 2, continuous.** Trunk deploys automatically. Releases are cut per unit of work rather than batched, and the release process itself refuses invalid states.
- **Level 3, ratcheted.** Every production escape in the last N incidents has a corresponding automated check, and each check has been confirmed to fail when its bug is reintroduced. Promotion runs automatically as the last phase.

Level 3 is the claim that matters, and it is the only one that requires evidence rather than intent.

## Worked example

DiskPush, an rsync desktop and CLI, on 2026-09-06. All of this is public in the repository history.

**Horizontal scale.** Eight agent worktrees were open on one checkout at once, covering unrelated concerns: SSH auth discovery, symlink handling, fleet runs across servers, the desktop CSP, file operations, connection defaults, and file list sorting. None of them waited on another.

**Release cadence.** Four releases reached users between 08:53 and 14:56 UTC, one working day: v0.2.17, v0.3.0, v0.4.0 and v0.5.0. Each carried one merged concern, and each shipped signed artifacts for the desktop app and the CLI.

**The gate refusing.** The release script checks every precondition before it writes anything: a dirty tree, a branch that is not trunk, a tag that already exists, a version that does not sort above the newest release, and any workspace package missing from its manifest list. That last guard exists because a package was added and silently left behind at an old version, release after release, with nothing failing.

**Test in prod, then the ratchet.** The desktop app shipped a window that was visibly broken across three releases, and each layer was only visible in production:

- v0.2.0 rendered unstyled. Next emits root-absolute asset URLs, the app loaded the bundle over `file://`, and every stylesheet and chunk resolved against the filesystem root and 404ed.
- v0.2.1 fixed the assets and rendered blank instead. A Next export carries its payload in inline `<script>` tags, the window sent `script-src 'self'`, and the browser refused all seven of them. This was invisible before only because the chunks had 404ed, so nothing had run at all.
- v0.2.2 fixed that by hashing the inline scripts into the policy.

No local harness could have caught the first bug, because a static server resolves absolute paths correctly by construction, and the bug only exists under `file://`. That is invariant 4 in one sentence.

The ratchet is `pnpm smoke:desktop`, which now guards all three layers: every referenced asset resolves through the same function that serves it, the bundle is not loaded over `file://`, and the policy admits every inline script the export contains. Each guard was confirmed to fail when its bug is reintroduced.

## Adopting it

The order matters, because each step is what makes the next one safe.

1. Write the local gate as one command. If it is three commands people remember in a different order, it is not a gate.
2. Make releases cheap and unattended. Until a release is a single command that refuses invalid states, nobody will cut four in a day.
3. Move agents into isolated trees before increasing their number.
4. Add a live verification step. Not the pipeline's green check, the running deployment.
5. Start the ratchet discipline from the next incident, not retroactively. Backfilling checks for old bugs is a project; ratcheting the next one is a habit.
6. Automate promotion last, once there is a steady stream of things worth announcing.

## Related standards

- [OpenPRD](./openprd.md), for the product decision that precedes a fan-out.
- [OpenSpec comparison](./openspec-comparison.md), for how a change bundle differs from a product decision.
- [OpenOntology](./openontology.md), for durable, source-backed domain knowledge shared across agents.

## License

This specification is published under the same terms as the rest of the LogicSRC standards surface, and may be implemented freely. Attribution is appreciated and not required.
