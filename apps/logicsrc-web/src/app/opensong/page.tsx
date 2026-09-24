import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/opensong",
  "OpenSong is one plain-text file that is a song: TITLE, STYLE, EXCLUDE STYLES and LYRICS as labelled blocks that paste straight into a music generator, [Section - direction] tags in the lyrics, no Markdown. Kept beside the audio as the same name with .txt; ID3 tags are derived from it, never the reverse."
);

const EXAMPLE = `TITLE:
Who Fired First

STYLE:
Nordic Viking metal fused with hip-hop, drop-D down-tuned heavy guitars, pounding war drums, tagelharpa and bone flute, male baritone half-rap lead, female contralto lead, massive mixed choir, 96 BPM, call and response

EXCLUDE STYLES:
autotune, EDM drop, lo-fi, comedy, spoken-word only, children's choir, country, reggae

LYRICS:
[Cold Open - four syncopated drop-D hits with gang shouts, then silence]
WHO!
FIRED!
FIRST!

[Verse 1 - male baritone rap, fast and percussive, confident flow]
Smoke on the fjord and a horn in the dark,
Two longhouses burning from a single spark.
Your side says theirs and their side says yours,
Both sides counting bodies on the frozen shores.

[Stop - all instruments stop, one whispered word]
Hold.

[Chorus - full impact, male and female trading lines, choir shouts, gang vocals]
Who fired first?
Nobody saw!
Who fired first?
Written in law!`;

const RULES: Array<[string, string]> = [
  ["Plain text", "UTF-8, no markup of any kind. Generators do not render Markdown, so the format has none."],
  ["Label lines", "A line on its own ending in a colon opens a block that runs to the next label. Matched without regard to case."],
  ["Four labels are the song", "TITLE, STYLE, EXCLUDE STYLES, LYRICS: the generator's four fields. Style descriptors are kept in order, because order is emphasis."],
  ["Other labels describe it", "ARTIST, ALBUM, TRACK, YEAR, LANGUAGE, MODEL, MADE BY, AUTHOR, AUDIO, NOTES. Unknown labels are kept. None of them is pasted."],
  ["Bracketed tags open sections", "[Name - direction]. The name is normalised for matching (verse, chorus, bridge, outro); unknown names like Cold Open are kept. A tag with nothing under it is instrumental."],
  ["Sung lines as written", "Capitals, punctuation and repeats reach the generator unchanged. A chorus sung three times is written three times."],
  ["Tags for the generator, not the listener", "A lyrics view may drop the tags. A generator always gets the whole block."],
  ["Albums", "NNN. Title.txt beside NNN. Title.mp3, plus an optional lyrics.txt with every song behind a ==== divider. The song file wins."]
];

const MAPPING: Array<[string, string]> = [
  ["TITLE", "TIT2 / TITLE"],
  ["ARTIST", "TPE1 / ARTIST"],
  ["ALBUM", "TALB / ALBUM"],
  ["TRACK", "TRCK / TRACKNUMBER"],
  ["sung lines of LYRICS", "USLT / LYRICS"],
  ["the whole file", "TXXX:OPENSONG / OPENSONG"]
];

const ABSENT: Array<[string, string]> = [
  ["No Markdown", "Generators take plain text. A format they cannot take is a format nobody pastes."],
  ["No required fields beyond the title", "A title and lyrics is a song. A title and a style is an instrumental."],
  ["No style vocabulary", "Genres, instruments and moods are kept as written. Models change what they understand too often for a list."],
  ["No timing, no chords", "Timestamps belong to the rendered audio (LRC does them). A chord chart is a different document."],
  ["No JSON", "The structured view is derived and regenerated from the text on every read."]
];

export default function OpenSongPage(): ReactNode {
  return (
    <SiteShell active="OpenSong">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenSong</h2>
          <p>
            One plain-text file that is a song, in the blocks a music generator takes. Paste it in,
            keep it beside the audio, and the song can be made again.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          A generated song starts as four fields in a web form and ends as an audio file with none
          of them attached. The style prompt, the exclusions and the section directions are gone
          once the page closes. Markdown is no help: the generator reads a # as a word. What it
          takes is plain text in labelled blocks with [Section] tags in the lyrics, so OpenSong
          fixes those labels and keeps the file.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Same rules as <Link href="/openrecipe">OpenRecipe.md</Link>: the file a
          person writes is canonical, every rule degrades, the structured view is derived.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
          <p>Track 002 of Þrøngva, When the Ravens Lied, shortened. The full song is in the spec.</p>
        </div>
        <pre style={pre}>{EXAMPLE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The eight rules</h2>
          <p>Every one of them degrades rather than fails.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Rule</th>
              <th style={th}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(([rule, meaning], index) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>
                    {index + 1}. {rule}
                  </strong>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Discovery</h2>
          <p>
            Next to the audio (<code style={mono}>002-who-fired-first.mp3</code> has{" "}
            <code style={mono}>002-who-fired-first.txt</code>), a{" "}
            <code style={mono}>{'<link rel="opensong">'}</code> on the track page, or a site index at{" "}
            <code style={mono}>/.well-known/opensong.txt</code>, one URL per line. Served as{" "}
            <code style={mono}>text/plain</code>.
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>ID3 and Vorbis tags, one way</h2>
          <p>
            Keep writing tags for players. Generate them from the text on every export. The text
            file is the canonical copy, because tags have no place for the style or the directions.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenSong</th>
              <th style={th}>ID3v2 / Vorbis comment</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map(([song, tag]) => (
              <tr key={song}>
                <td style={td}>{song}</td>
                <td style={td}>
                  <code style={mono}>{tag}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/opensong">Specification</Link>: the shape, eight rules, albums,
            discovery, the tag mapping
          </li>
          <li>
            <Link href="/openrecipe">OpenRecipe.md</Link>, the same canonical-file idea for a recipe;{" "}
            <Link href="/docs/openfile">OpenFile</Link>, the audio a song sits beside
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
