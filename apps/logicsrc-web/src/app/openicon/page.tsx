import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";
import { Gallery } from "./gallery";
import { OPENICON_REPO } from "./set";

export const metadata: Metadata = {
  title: "OpenIcon · LogicSRC",
  description:
    "OpenIcon is an icon set as a folder: one openicon.json naming every icon with aliases and keywords, 24x24 currentColor SVGs, and three terminal glyphs per icon (Nerd Font, Unicode, ASCII) so a TUI draws the best one it can. Brand logos say they are brands.",
  alternates: { canonical: "/openicon" }
};


/** key, Nerd Font codepoint, Unicode, ASCII: straight from openicon.json. */
const GLYPHS: Array<[string, string, string, string]> = [
  ["mail", "U+F01F0", "✉", "@"],
  ["phone", "U+F0DF0", "☎", "tel"],
  ["link", "U+F0339", "🔗", "~"],
  ["settings", "U+F0493", "⚙", "*"],
  ["terminal", "U+F018D", "⌨", ">_"],
  ["git-branch", "U+F418", "⎇", "Y"],
  ["warning", "U+F002A", "⚠", "!"],
  ["github", "U+F02A4", "🐙", "gh"]
];

const EXAMPLE = `{
  "openicon": "0.1",
  "name": "OpenIcon",
  "license": "MIT",
  "made_by": "ai",
  "grid": { "size": 24, "stroke": 2, "padding": 2 },
  "sizes": [16, 24, 32, 64, 128],
  "icons": [
    { "key": "mail", "category": "communication",
      "aliases": ["email", "envelope"], "keywords": ["message", "inbox"],
      "svg": "svg/mail.svg", "png": "png/{size}/mail.png",
      "tui": { "nerd": "\\u{f01f0}", "nerd_code": "f01f0",
               "nerd_name": "md-email_outline", "unicode": "✉", "ascii": "@" } },
    { "key": "github", "category": "brand", "brand": true,
      "trademark": "GitHub and its logo are trademarks of their owner. …",
      "source": "simple-icons:github", "license": "CC0-1.0", "made_by": "human",
      "svg": "svg/github.svg",
      "tui": { "nerd_code": "f02a4", "unicode": "🐙", "ascii": "gh" } }
  ]
}`;

const RULES: Array<[string, string]> = [
  ["A set is a folder", "openicon.json at the root, every path relative to it; unknown keys are kept."],
  ["The key is the name", "Kebab case: mail, git-pull-request. The key is the file name; a brand's key is its own name."],
  ["Aliases find one icon, keywords find many", "email is mail everywhere, so every key and alias is unique; keywords like money are shared search terms."],
  ["Files take the text colour", "24x24 view box, currentColor, and a grid block stating size, stroke and padding so sets can be matched."],
  ["Every icon has terminal glyphs", "tui.nerd (with its codepoint and Nerd Fonts name), tui.unicode (one character), tui.ascii (1 to 4 printable characters)."],
  ["A terminal picks the best it can draw", "Nerd, then Unicode, then ASCII, from OPENICON_GLYPHS, NERD_FONT=1 or the locale. Pad to the cell width: an emoji can be two columns."],
  ["A brand says it is one", "brand: true, a trademark note, its source and its own licence. Logos are taken from their owners or a set that publishes them, never redrawn."],
  ["The set says what made it", "made_by and the W3C AI disclosure vocabulary, per set and per icon: the reference set's drawn icons are ai, its logos human."]
];

const ABSENT: Array<[string, string]> = [
  ["No colour", "Icons take the text colour. A brand's own colour is optional and ignorable."],
  ["No style variants", "Outline and filled are two sets, or two keys. One key, one drawing."],
  ["No webfont format", "A font is a build output a set may ship; SVG and the tui glyphs are the interchange."],
  ["No name registry", "Keys are the set's own; aliases are how it answers to another set's names."],
  ["No animation", "A spinner is a component, not an icon."]
];

export default function OpenIconPage(): ReactNode {
  return (
    <SiteShell active="OpenIcon">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenIcon</h2>
          <p>
            An icon set as a folder, and the first one that knows what to draw in a terminal: SVG in a browser, a
            Nerd Font glyph in a patched terminal, a Unicode symbol in a plain one, ASCII over a serial line.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every interface needs the same few hundred icons, and every set names them differently: Lucide&apos;s mail
          is Font Awesome&apos;s envelope is Material&apos;s email. Brand logos sit beside drawn icons as if a
          trademark were just another shape. And no set says what an icon should be when there are no pixels, so
          TUIs hard-code a Nerd Font codepoint and show a box everywhere else.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. A sibling of <Link href="/openemoji">OpenEmoji</Link>.
        </p>
      </div>

      <div className="band" id="gallery">
        <div style={{ maxWidth: "52rem", marginBottom: "0.4rem" }}>
          <h2 style={{ margin: "0 0 0.4rem" }}>The reference set: all 370</h2>
          <p style={{ color: "#41505d", margin: 0, lineHeight: 1.6 }}>
            259 icons drawn on a 24x24 grid with 2px strokes, and 111 brand logos from Simple Icons and Font Awesome
            Free. Search by name, alias or keyword, filter by category or brand, and switch between the SVG and the
            glyph a terminal gets (Nerd Font, Unicode, ASCII). Click one for its glyphs, SVG and downloads. The files
            are in <a href={OPENICON_REPO}>profullstack/openicon</a>.
          </p>
        </div>
        <Gallery />
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Three glyphs per icon</h2>
          <p>What a TUI draws, best first. Your browser probably has no Nerd Font, so that column shows the codepoint.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Icon</th>
              <th style={th}>Nerd Font</th>
              <th style={th}>Unicode</th>
              <th style={th}>ASCII</th>
            </tr>
          </thead>
          <tbody>
            {GLYPHS.map(([key, nerd, unicode, ascii]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>
                  <code style={mono}>{nerd}</code>
                </td>
                <td style={{ ...td, fontSize: "1.2rem" }}>{unicode}</td>
                <td style={td}>
                  <code style={mono}>{ascii}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
          <p>openicon.json, trimmed to a drawn icon and a brand logo.</p>
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
          <h2>Use it</h2>
          <p>
            <code style={mono}>icon</code> in <a href="https://github.com/profullstack/cli-tools">profullstack/cli-tools</a>{" "}
            builds the set; <a href="https://hqtui.com">hqtui</a> ships it as its default icon pack.
          </p>
        </div>
        <pre style={pre}>{`icon build --out ./openicon   # openicon.json, svg/, png/, sprite.svg
icon glyph mail               # the best glyph this terminal can draw

// hqtui
import { icon } from "@profullstack/hqtui";
icon("mail");                 // "\\u{f01f0}", "✉" or "@"`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openicon">Specification</Link>: the shape, eight rules, discovery, the mapping from Lucide,
            Tabler, Font Awesome, Nerd Fonts and Simple Icons
          </li>
          <li>
            <a href="https://github.com/profullstack/openicon">profullstack/openicon</a>: the reference set
          </li>
          <li>
            <Link href="/openemoji">OpenEmoji</Link>, the sibling format for emoji
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
