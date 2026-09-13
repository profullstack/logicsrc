# OpenL10n

OpenL10n is the record of what a file says, in any language: a transcript of a recording, a film or a broadcast, kept once under the identity of the media rather than of whoever played it, with every translation of it kept beside the original and marked with the language it came from. A player that meets the same file reads the lines instead of hearing them again; a reader that wants Swedish gets the Swedish that was made once, or asks for it and it is made and kept. It is the words half of [OpenFile](/openfile): OpenFile says what the bytes are, OpenL10n says what they say. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with a reference implementation in [nixamp](https://nixamp.com).

Status: **0.1**. A description of a record already kept, published so anything that hears or translates can keep the same one.

Slug: `openl10n`

## The problem

Speech to text costs a CPU for as long as the sound lasts, and translation costs one for as long as the text is. A film heard on Tuesday says the same words on Thursday, on every machine that plays it, and today each of them hears it again. The transcript that was made is thrown away with the process that made it, or kept in a shape only that program reads, under a name only that machine knows: the channel it was on, the path it was at.

The pieces exist. OpenFile names a file by the hash of its bytes, so the same file anywhere is one identity. SRT and WebVTT carry timed lines. What is missing is the record between them: one transcript per file per language, addressed by the file, that any program can read, add to, and translate once.

## Terms

- The **media** is what was said: a file, a link, or a broadcast. Its **identity** is how the record is addressed.
- A **transcript** is the media's words in one language, as timed lines. The **original** is the transcript in the language that was spoken; a **translation** is a transcript in another language, made from an original or from another translation.
- A **line** is one thing said, with when it began and ended as seconds into the media.
- A **keeper** is whatever holds transcripts and answers for them: a site, a service, a program's own store.
- A **hearer** is whatever turns sound into an original: a speech model and the machine it runs on.
- A **reader** is anything that reads a transcript: a player drawing captions, a subtitle file, a search index, an agent.

## The record

A keeper serves a transcript as a JSON document.

```json
{
  "id": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "language": "sv",
  "translatedFrom": "en",
  "complete": true,
  "model": "Xenova/opus-mt-en-sv",
  "seconds": 5400,
  "updated": "2026-09-13T09:24:39Z",
  "lines": [
    { "start": 0, "end": 6.14, "text": "Och sedan, frågan om behörigheter i molnet." },
    { "start": 6.14, "end": 11.3, "text": "Jag tror att jag glömde vilket land det var." }
  ],
  "languages": [
    { "language": "en", "translatedFrom": null, "lines": 700, "complete": true, "url": "https://nixamp.com/hash/d6c3f828…c493ff.srt?language=en" },
    { "language": "sv", "translatedFrom": "en", "lines": 700, "complete": true, "url": "https://nixamp.com/hash/d6c3f828…c493ff.srt?language=sv" }
  ]
}
```

The smallest valid record is an identity, a language and lines:

```json
{ "id": "sha256:d6c3f828…c493ff", "language": "en", "lines": [{ "start": 0, "end": 5, "text": "Hello." }] }
```

The rules, and every one degrades:

1. **`id`, `language` and `lines` are the only required keys.** A reader lists what it was given and reports the rest as unstated.
2. **`id` is the media's identity.** For a file it is the OpenFile id, `sha256:` and the hex of every byte, so the transcript of a file is found from the file's own record. For a link that is played rather than fetched it is `url:` and the address the player was given, without the fragment. For a broadcast, which has no bytes to hash, it is `live:` and the host, the channel and when it began: `live:server1.example:4321/main@1789292084930`, the moment as milliseconds since the epoch, so a second airing is a second transcript. A keeper may accept a quicker fingerprint of a file as an alias and say so; the `sha256:` id is the one two keepers agree on.
3. **`language`** is the ISO 639-1 code of the lines. `""` means the hearer did not say, which a reader shows as unknown rather than as English.
4. **`translatedFrom`** is the language this transcript was made from, and absent or `null` means these are the words as spoken. A translation of a translation names the language it was made from, not the original's, so a reader can see the chain.
5. **`lines`** are in order of `start`. `start` and `end` are seconds into the media, decimals allowed. `text` is plain text, not markup. A line is what one hearing produced: a sentence, or a window of a few seconds when the hearer worked in windows. Two lines may overlap a little at their edges; a reader that finds two lines saying the same thing for the same seconds keeps the longer.
6. **`complete`** says the whole media was heard in one pass. Absent means it was heard in pieces as it played, which may have gaps where nobody was listening, and a keeper appends to an incomplete transcript and replaces it with a complete one. Nothing appends to a complete transcript.
7. **`model`** names what heard or translated it, as the hearer names itself. `seconds` is how far into the media the lines reach. `updated` is when the record last changed.
8. **`languages`** lists every transcript the keeper has for this media, each with its `language`, `translatedFrom`, how many `lines`, whether it is `complete`, and the `url` it is served at. A reader picks a language from this list rather than guessing.
9. **A language asked for that the keeper does not have is made, once, and kept**, when the keeper can translate. The keeper answers `202` with `{ "translating": { "done": 120, "total": 700 } }` and the lines it has so far while a long one is being made, and `200` with the transcript once it is as far along as the original. A reader asks again later; it never asks the model itself.
10. **Formats.** A keeper serves the same transcript as SubRip (`.srt`, `application/x-subrip`), WebVTT (`.vtt`, `text/vtt`) and plain text (`.txt`, one line per line) by extension or by `?format=`, with `?language=` picking the transcript. The JSON is the record; the others are renderings of it.
11. **Unknown keys are kept.** A keeper says more than this document names, under its own key, and a reader passes it through.

Serve it as `application/json`.

## Discovery

A reader finds a transcript three ways:

1. From the media's OpenFile record: a `transcripts` list there with the same rows as `languages` above, or, until a keeper serves it at the top, the same list under the keeper's own key. nixamp serves it as `nixamp.transcripts` today.
2. `<link rel="openl10n" href="...">` on a page about the media, or `Link: <...>; rel="openl10n"` on the media itself, pointing at the record in the original language; `languages` in it points at the rest.
3. A URL handed to the reader directly.

A keeper that lists transcripts across many media serves `/.well-known/openl10n.json`: `{ "keeper": { "name", "web" }, "transcripts": [ ...records without their lines... ] }`, newest first, so a directory learns what has been written down without asking file by file.

## Hearing and keeping

A conforming hearer:

1. Says which language it heard. A speech model told nothing assumes a language, and a Swedish recording heard as English comes back as three English words repeated; detecting first is what makes the transcript say anything.
2. Stamps each line in seconds into the media, not in wall-clock time. A player that hears a stream live converts on the way in, from where the stream is in the media or from when the broadcast began, so a transcript of a file means the same thing whichever machine made it.
3. Sends what it heard to the keeper as it goes, in batches, under the media's identity and the language heard, so a process that dies keeps most of what it heard.
4. Asks the keeper first. A moment the keeper has already been through is read out, not heard again, and only what is new goes to the model.

A conforming keeper merges what it is sent (rule 6), never re-hears what it has, translates once per language (rule 9), and serves every rendering (rule 10).

## Live captions

A broadcast is heard as it happens, a few seconds at a time, and a reader watching it wants each line as it is said, in its own language. A keeper or a player streams lines with wall-clock stamps beside the media-second ones: `{ "at": 1789292125085, "until": 1789292130085, "start": 40.2, "end": 45.2, "text": "…", "language": "sv", "original": "…" }`, `at` and `until` being when the sound was at the live edge, so a page can hold each line until its own playback gets there. A translated line carries the words as spoken in `original`, so a reader can show both. The stream is the player's business; the kept record is this document's.

## What is deliberately absent

**No model.** A hearer is whatever hears; the record says which one it was and nothing about how good it is. Two keepers may disagree about the same seconds and a reader sees both models.

**No word timing.** A line is the unit. Word-level timing doubles the cost of hearing for a caption that lands close to the voice either way; a keeper that has it puts it under its own key.

**No rights.** What may be transcribed or translated is the media's business, and OpenFile's `attestation` is where that is said. A keeper that requires consent reads it there.

**No search.** A keeper answers by identity. Finding a file by what it says is a directory's job.

## Related standards

- [OpenFile](/openfile): the media's identity and its record, which lists these transcripts.
- [OpenI18n](/openi18n): how a keeper says which languages it can translate between, and how a reader asks for one.
- [OpenSite](/opensite): the card a page draws for the media, which may quote the transcript.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the record, identities for files, links and broadcasts, translations, completeness, formats, discovery, hearing and keeping, live lines. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
