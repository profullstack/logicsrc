# OpenSong

OpenSong is one plain-text file that is a song: its title, the style it is played in, the styles it must not drift into, and the lyrics with their sections, laid out as labelled blocks that paste straight into a music generator's fields. No Markdown, no JSON, no XML. The same file a person reads is the file Suno reads, the file an archive keeps beside the audio, and the file an agent parses. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Written in the spirit of [OpenRecipe.md](/openrecipe): the file a person writes is canonical, every rule degrades, and anything structured (tags, a lyrics database row) is derived from it.

Slug: `opensong`

## The problem

A song made with a generator starts as four text fields in a web form and ends as an audio file with none of them attached. The style prompt that made it sound the way it does, the exclusions that kept it from turning into EDM, and the section directions that told the singer when to whisper are gone once the page is closed. To remake the song, cover it, or put it on an album with eleven others that sound like a set, you need those fields back, and nobody kept them.

The obvious fix is Markdown, and it does not work: the generator does not render Markdown. A `#` becomes a sung word or is dropped, `**bold**` is read as asterisks, and a bullet is a hyphen someone has to delete. What the generator accepts is plain text in blocks, with section tags in square brackets inside the lyrics. That is already a format; it only needs its labels agreed and the file kept.

## The shape

```text
TITLE:
Who Fired First

STYLE:
Nordic Viking metal fused with hip-hop, drop-D down-tuned heavy guitars, pounding war drums, tagelharpa and bone flute, deep throat-singing drones, cinematic strings, male baritone half-rap lead, female contralto lead, massive mixed choir, gang shouts, anthemic, epic, modern heavy production, clear intelligible English vocals, 96 BPM, hard hip-hop metal banger, swung syncopated drop-D groove, trap hi-hats under metal riffs, call and response

EXCLUDE STYLES:
autotune, EDM drop, lo-fi, comedy, spoken-word only, children's choir, country, reggae

LYRICS:
[Cold Open - four syncopated drop-D hits with gang shouts, then silence]
WHO!
FIRED!
FIRST!

[Main Riff - swung low-D pedal riff, kick doubles guitar, sliding power chords, instrumental]

[Verse 1 - male baritone rap, fast and percussive, confident flow]
Smoke on the fjord and a horn in the dark,
Two longhouses burning from a single spark.
Your side says theirs and their side says yours,
Both sides counting bodies on the frozen shores.
Show me the arrow, show me the bow,
Show me the archer, show me the snow,
Show me the tracks and the hand that drew,
Every proof they sold me was a copy of the truth.
Signal on the ridge in a voice I know,
Sounds like my captain but my captain's below.
Sounds like a brother but my brother's in chains,
Somebody is wearing all our voices like a mask again.

[Pre-Chorus - female contralto, four-bar ascent, drums thin out]
Stone by stone,
The story's moving.
Flame by flame,
The proof dissolves.

[Stop - all instruments stop, one whispered word]
Hold.

[Chorus - full impact, male and female trading lines, choir shouts, gang vocals]
Who fired first?
Nobody saw!
Who fired first?
Written in law!
Who fired first?
Ask who got paid!
Two halls burning for a lie that was made!

[Verse 2 - female contralto rapping, sharp and cold, then male joins]
They drew the map in a warm dry room,
Priced every harbor, priced every tomb,
Sold the shields to the north and the spears to the south,
Put the same forged word into every mouth.
I will not swing on a merchant's cue,
I will not bleed for a rumor that he grew,
I want the arrow and I want the name,
I want the hand behind the fire and the flame.

[Chorus - full band, bigger choir, drop-D hits on each question]
Who fired first?
Nobody saw!
Who fired first?
Written in law!
Who fired first?
Ask who got paid!
Two halls burning for a lie that was made!

[Breakdown - half-time, male call and choir response, huge drums]
Who lit the beacon?
Nobody here!
Who wrote the order?
Nobody clear!
Who sells the iron?
Now we know!
Put down the arrow and let the liar show!

[Outro - final riff, four hits and gang shout]
WHO!
FIRED!
FIRST!
```

That is track 002 of Þrøngva, *When the Ravens Lied*, exactly as it was pasted into Suno's custom mode, one block per field.

## The rules

There are eight, and every one of them degrades rather than fails.

**1. The file is plain text.** UTF-8, any line ending, no markup of any kind. Nothing in it is rendered; everything in it is either a label, a value, or a lyric. A reader that meets Markdown characters keeps them as written, because to a generator they are characters.

**2. A label is a line on its own that ends in a colon.** `TITLE:`, `STYLE:`, `EXCLUDE STYLES:`, `LYRICS:`. The block's value is every line after the label up to the next label line or the end of the file, with leading and trailing blank lines trimmed. Labels are written in capitals and matched without regard to case or surrounding spaces, so `Exclude styles :` is `EXCLUDE STYLES:`. A label line is only a label outside LYRICS or when it is one of the known labels; inside LYRICS, a sung line that happens to end in a colon stays a lyric.

**3. Four labels are the song, and they are the generator's four fields.**

- `TITLE`: the name of the song, one line.
- `STYLE`: comma-separated descriptors, kept as written and in order, because order is emphasis to a generator. Tempo and key are descriptors like any other (`96 BPM`, `D minor`); a reader may lift them out and must leave them in.
- `EXCLUDE STYLES`: comma-separated descriptors the song must not have, kept as written.
- `LYRICS`: the words and the section tags, pasted verbatim (rule 5).

A title and lyrics is a valid song. So is a title and a style with no LYRICS block, which is an instrumental.

**4. Other labels describe the song and are never pasted.** The ones a reader should understand: `ARTIST`, `ALBUM`, `TRACK` (a number, or `2/12`), `YEAR`, `LANGUAGE`, `MODEL` (the generator and version that made it, as written), `MADE BY` (`human`, `ai` or `both`, the [OpenWebring](/docs/openwebring) vocabulary, stating who wrote the words and the style), `AUTHOR` (a name, or an [OpenProfile.md](/openprofile) URL), `AUDIO` (the URL or file name of the rendered track), and `NOTES`. Unknown labels are kept as written, so `SEED`, `PERSONA` or `COVER OF` work without anyone adding them to a list. A tool that pastes into a generator pastes the four fields of rule 3 and nothing else.

**5. Inside LYRICS, a line that is only a bracketed tag opens a section.** `[Verse 1]`, `[Chorus - full band, bigger choir]`. The text before the first ` - ` is the section's name; the rest is the direction, a performance note for the singer and the band. Names are kept verbatim and normalised for matching: `intro`, `verse`, `pre-chorus`, `chorus`, `post-chorus`, `hook`, `bridge`, `breakdown`, `interlude`, `build`, `drop`, `solo`, `outro`, `end`, with a trailing number kept as the section's ordinal. A name that matches none of them (`Cold Open`, `Main Riff`, `Stop`) keeps its own name and is not dropped. A tag with no lines under it is an instrumental passage.

**6. Every other line in LYRICS is sung, exactly as written.** Capitals, punctuation, repeated lines and blank lines between sections all reach the generator unchanged, because they change the performance: `WHO!` is shouted, `Hold.` is one word into silence. A line in parentheses is a backing vocal or echo by convention and stays in place. A chorus sung three times is written three times; there is no repeat marker, because generators do not expand one.

**7. A reader that shows lyrics to a listener may drop the tags; a reader that sends them to a generator never does.** The lyrics a listener sees are the sung lines with section names as spacing. The lyrics a generator gets are the whole block. Both come from the same file, and neither is stored separately.

**8. An album is songs in order, one file each, with an optional file for the whole set.** Each song is `NNN. Title.txt`, zero-padded, and its audio has the same name with its own extension: `002. Who Fired First.txt` beside `002. Who Fired First.mp3`. The album file, `lyrics.txt` by convention, opens with a header (first line `Artist - Album`, then any notes) and then repeats every song, each preceded by a divider line: a run of `=`, the song's file name without extension, and another run of `=`.

```text
Þrøngva - When the Ravens Lied
Suno custom mode: paste TITLE, STYLE, EXCLUDE STYLES and LYRICS into the matching fields.
Save each song as 'NNN. Title.mp3' (e.g. 002. Who Fired First.mp3).

==================== 001. Huginn Brings the Word ====================

TITLE:
Huginn Brings the Word
...

==================== 002. Who Fired First ====================

TITLE:
Who Fired First
...
```

Where the song file and the album file disagree, the song file wins. The album file exists so one paste or one read covers the record.

## Discovery

The file is served, not registered. Three ways, and a reader should try all three.

**1. Next to the audio.** `https://example.com/music/002-who-fired-first.mp3` has its song at `https://example.com/music/002-who-fired-first.txt`. Same name, `.txt`.

**2. A link element.** The track's page points at the file:

```html
<link rel="opensong" href="https://example.com/music/002-who-fired-first.txt">
```

or as a header, `Link: <...>; rel="opensong"`, on the audio response itself.

**3. A site index.** A site with many songs serves `/.well-known/opensong.txt`: plain text, one song URL per line, newest first, blank lines and lines starting with `#` ignored. An album file may be listed like a song; a reader tells them apart by the divider lines.

Serve every file as `text/plain; charset=utf-8`.

## ID3 and other tags, one way

An MP3 carries ID3 frames and a FLAC carries Vorbis comments, and players read those. Keep writing them. The mapping goes one way:

| OpenSong | ID3v2 | Vorbis comment |
|---|---|---|
| `TITLE` | `TIT2` | `TITLE` |
| `ARTIST` | `TPE1` | `ARTIST` |
| `ALBUM` | `TALB` | `ALBUM` |
| `TRACK` | `TRCK` | `TRACKNUMBER` |
| `YEAR` | `TDRC` | `DATE` |
| `LANGUAGE` | `TLAN` | `LANGUAGE` |
| sung lines of `LYRICS` (rule 7) | `USLT` | `LYRICS` |
| the whole file | `TXXX:OPENSONG` | `OPENSONG` |

The tags are written from the file on every export. **The text file is the canonical copy.** A library that edits the tags and regenerates the file from them has lost the style and the directions, which the tags have no place for.

## What is deliberately absent

**No Markdown, and no syntax of any kind in the lyrics.** Generators take plain text. A format they cannot take is a format nobody pastes.

**No required fields beyond the title.** A title and lyrics is a song; a title and a style is an instrumental.

**No style vocabulary.** Genres, instruments and moods are kept as written. Generators change what they understand with every model; a list would be out of date on publication.

**No timing.** Line-level timestamps belong to the rendered audio, not the song, and LRC already does them. A reader may generate an `.lrc` beside the audio and must not write times into this file.

**No chords.** A chord chart is a different document. OpenSong describes what a generator or a singer needs to make the song, not how to play it on a guitar.

**No JSON.** A reader may derive a structured view (title, style descriptors, exclusions, sections with name, direction and lines, the descriptive labels) and regenerate it from the text on every read.

## Reading one

A conforming reader:

1. Fetches the file from any of the three discovery locations and parses it under the eight rules.
2. Keeps every label, line and tag it does not understand.
3. Pastes into a generator only `TITLE`, `STYLE`, `EXCLUDE STYLES` and `LYRICS`, each verbatim.
4. Reports absence as absence: no stated style, no stated tempo, no stated maker.
5. Shows `MADE BY` whenever it shows the song, when the file states it.

## Writing one

By hand, in any editor, in the same sitting the song is made: write the four blocks, paste them into the generator, and save the file under the name the audio will get. A tool that generates songs writes the file before it submits the job, so a failed render still leaves the song behind.

## Name

OpenSong is also the name of an older, unrelated worship-presentation application (opensong.org) with its own XML song format, and OpenLyrics is an XML format from the same world. This specification is not either of them and does not read their files; the collision is in the name only.

## Related standards

- [OpenRecipe.md](/openrecipe): the same idea, the file a person writes is the canonical copy and the machine view is derived, for a recipe.
- [OpenFile](/docs/openfile): the audio file a song sits beside, with hash and routes.
- [OpenL10n](/docs/openl10n): a transcript of the rendered track in another language, which is a translation of the song and not a song.
- [OpenWebring](/docs/openwebring): where `made_by` comes from.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-24 | First publication: plain-text labelled blocks matching a generator's fields, bracketed section tags, album files, three discovery locations, one-way mapping to ID3 and Vorbis comments. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
