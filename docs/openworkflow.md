# OpenWorkflow

OpenWorkflow is one JSON file that collects [OpenTasks](/docs/opentask) into a workflow: a named set of tasks a person does together, such as "release a package" or "close the month", in the order they do them or in any order. Each task is carried inline or referenced by URL with its digest, so a workflow can gather tasks from more than one publisher without copying them. A publisher lists its workflows at `/.well-known/openworkflow.json`. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. The format w3bs.org/workflows serves, published so other task libraries can serve the same thing.

Slug: `openworkflow`

## The problem

One task is rarely the job. Publishing a release is a version bump in a terminal, a changelog in an editor and an announcement in a browser; each can be demonstrated and written down as an OpenTask, but the job is all three, in order, with the second waiting on the first. Without a collection, a person hands an agent three files and explains the order in chat, and the next person to run it has to be told again.

A workflow file is that explanation written down: which tasks, in what order, which ones wait on which, and where a runner stops the whole thing.

## Terms

- A **workflow** is a named collection of tasks. Its **workflow file** is the JSON document this specification describes.
- An **entry** is one task in a workflow: the task inline, or a reference to a task file by URL.
- A **runner** is the program that carries a workflow out, one task at a time, under the [OpenTask runner rules](/docs/opentask#runner-rules).

## The workflow file

```json
{
  "type": "logicsrc.openworkflow",
  "version": "0.1",
  "id": "release-a-package",
  "title": "Release a package",
  "description": "Bump the version, write the changelog, announce it.",
  "publisher": { "name": "@anthony", "url": "https://w3bs.org/workflows" },
  "updated": "2026-10-19T12:00:00Z",
  "order": "sequence",
  "tasks": [
    {
      "url": "https://w3bs.org/tasks/tk_4Hq8sP1x.json",
      "sha256": "3f1b5c0e9a0e4d7b8c2a6f5d4e3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a",
      "id": "bump-the-version",
      "title": "Bump the version"
    },
    {
      "url": "https://w3bs.org/tasks/tk_Lm2Rt7vQ.json",
      "sha256": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "id": "write-the-changelog",
      "title": "Write the changelog",
      "after": ["bump-the-version"]
    }
  ]
}
```

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `logicsrc.openworkflow` |
| `version` | yes | `0.1` |
| `id` | yes | A slug, unique within its publisher. |
| `title` | yes | A short name a person reads in a list. |
| `description` | no | What the workflow is for, at most 4000 characters. Untrusted text, as in OpenTask. |
| `publisher` | no | `{ "name", "url" }`: who serves it. |
| `updated` | no | When it last changed. |
| `order` | yes | `sequence` (run the entries in the order listed) or `any` (in any order that respects `after`). |
| `tasks` | yes | At least one entry. See [Entries](#entries). |
| `license` | no | An SPDX identifier for the file. |

## Entries

An entry is one of two shapes.

**Inline**: the whole OpenTask under `task`.

```json
{ "task": { "type": "logicsrc.opentask", "version": "0.1", "id": "empty-the-trash", "...": "..." } }
```

**Reference**: where to fetch it and what it must hash to.

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | An `https` URL serving the task file. |
| `sha256` | yes | The SHA-256 of the bytes served, lowercase hex. A runner refuses a task whose bytes do not match. |
| `id` | yes | The task's `id`, repeated so a person can read the list without fetching. |
| `title` | yes | The task's `title`, likewise. |

Either shape may add `after`, a list of task ids in the same workflow that must finish first, and `optional: true`, which lets a runner skip the entry when a person says so. Task ids are unique within a workflow, `after` names only ids listed earlier, and an entry cannot wait on itself.

## Runner rules

A conforming runner follows every [OpenTask runner rule](/docs/opentask#runner-rules) for each task, and:

1. **Shows the workflow first.** Every entry, its status (an inline task's `status`, or "not yet fetched"), and the order.
2. **Checks references.** It fetches each referenced task over HTTPS, checks its digest and validates it before showing it. A mismatch stops the workflow.
3. **Asks for parameters per task.** Parameters belong to their task; a value given for one task is not reused by another unless a person says so.
4. **Stops the workflow when a task stops.** A task that stops, fails or is skipped without permission ends the run. The runner reports which tasks finished.
5. **Never starts an entry early.** An entry starts only when every id in its `after` has finished.

## The index

A publisher lists its workflows at `/.well-known/openworkflow.json`:

```json
{
  "type": "logicsrc.openworkflow-index",
  "version": "0.1",
  "publisher": "https://w3bs.org",
  "updated": "2026-10-19T12:00:00Z",
  "workflows": [
    { "url": "https://w3bs.org/workflows/release-a-package.json", "id": "release-a-package", "title": "Release a package", "tasks": 2 }
  ]
}
```

## Publishing

A publisher serves workflow files as `application/json` over HTTPS. When a referenced task changes, its digest changes, so the workflow is republished with the new digest or it stops working. That is deliberate: a workflow someone reviewed cannot change underneath them.

## Validation

The JSON Schemas are `@logicsrc/schemas/openworkflow` and `@logicsrc/schemas/openworkflow-index`; an inline task is checked against `@logicsrc/schemas/opentask`. `@logicsrc/validators` also checks that task ids are unique, that `after` names only earlier ids, and every OpenTask rule on inline tasks.

```sh
npx @logicsrc/validators openworkflow workflow.json
```
