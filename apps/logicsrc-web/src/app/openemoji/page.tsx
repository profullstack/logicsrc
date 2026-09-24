import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openemoji",
  "OpenEmoji is an emoji set as a folder: one openemoji.json that states coverage, licence and who or what drew it (made_by, W3C AI disclosure), and glyphs named by fully-qualified codepoint sequence. Standard and custom emoji, PNG, SVG and colour fonts, rendered as text with the character as alt."
);

/** Drawn by the reference implementation, `emoji` in profullstack/cli-tools. */
const SAMPLE: Array<[string, string, string]> = [
  ["1f600", "😀", "grinning face"],
  ["1f602", "😂", "face with tears of joy"],
  ["1f979", "🥹", "face holding back tears"],
  ["1f525", "🔥", "fire"],
  ["2764-fe0f", "❤️", "red heart"],
  ["1f44d", "👍", "thumbs up"],
  ["1f44d-1f3fd", "👍🏽", "thumbs up: medium skin tone"],
  ["1f469-200d-1f4bb", "👩‍💻", "woman technologist"],
  ["1f469-1f3fe-200d-1f4bb", "👩🏾‍💻", "woman technologist: medium-dark skin tone"],
  ["1f431", "🐱", "cat face"],
  ["1f419", "🐙", "octopus"],
  ["1f363", "🍣", "sushi"],
  ["1f3d4-fe0f", "🏔️", "snow-capped mountain"],
  ["1f680", "🚀", "rocket"],
  ["1f4a1", "💡", "light bulb"],
  ["1f3b8", "🎸", "guitar"],
  ["267b-fe0f", "♻️", "recycling symbol"],
  ["1f1ef-1f1f5", "🇯🇵", "flag: Japan"],
  ["1f1e7-1f1f7", "🇧🇷", "flag: Brazil"]
];

const EXAMPLE = `{
  "openemoji": "0.1",
  "name": "OpenEmoji",
  "license": "CC-BY-4.0",
  "unicode": "18.0",
  "made_by": "ai",
  "disclosure": "ai-generated",
  "ai_model": "gpt-image-2",
  "ai_prompt_url": "style.txt",
  "sizes": [16, 32, 64, 128, 512],
  "fonts": [{ "format": "cbdt", "path": "font/OpenEmoji-CBDT.ttf" }],
  "coverage": { "total": 3963, "drawn": 3963, "missing": [] },
  "emoji": [
    { "key": "1f44d", "char": "👍", "name": "thumbs up",
      "png": "png/{size}/1f44d.png", "svg": "svg/1f44d.svg" },
    { "key": "1f44d-1f3fd", "char": "👍🏽", "name": "thumbs up: medium skin tone",
      "base": "1f44d", "png": "png/{size}/1f44d-1f3fd.png" },
    { "key": "x-shipit", "shortcodes": ["shipit"], "name": "ship it",
      "group": "Custom", "png": "png/{size}/x-shipit.png" }
  ]
}`;

const RULES: Array<[string, string]> = [
  ["A set is a folder", "openemoji.json at the root, every path relative to it. Works on disk, in git, behind a CDN or in a package."],
  ["Standard keys are codepoints", "The fully-qualified sequence, lowercase hex, hyphen-joined: 2764-fe0f, 1f469-1f3fe-200d-1f4bb. The key is the file name. Lookups retry without FE0F."],
  ["Custom keys start with x-", "x-shipit, with shortcodes, a name and group Custom. Shortcodes belong to their set; nothing Unicode encodes gets an x- key."],
  ["The descriptor says where files are", "png with a {size} placeholder, svg, optional webp, avif or apng. Fonts are listed once per set with their colour format."],
  ["Coverage is stated", "total, drawn and missing against the named Unicode version. Missing falls back to the platform's emoji, never to a box."],
  ["A variant names its base", "A skin-tone sequence carries base, so any picker can group tones and a model-drawn set can say its tones were derived."],
  ["The set says what made it", "made_by human | ai | both, plus the W3C AI disclosure vocabulary: disclosure, ai_model, ai_provider, ai_prompt_url. Per set, overridable per emoji."],
  ["Rendered emoji stay text", "img alt is the character itself and title its CLDR name, so copy, paste and screen readers keep the emoji. Fonts do the same with no images."]
];

const MAPPING: Array<[string, string, string, string]> = [
  ["shortcodes[0]", "shortcode", "the map's key", "name"],
  ["png", "url / static_url", "the map's value", "CDN URL from id"],
  ["group", "category", "none", "none"],
  ["apng present", "url differs from static_url", "none", "animated"]
];

const ABSENT: Array<[string, string]> = [
  ["No registry", "A set is wherever its descriptor is. A directory is anyone reading /.well-known/openemoji.json."],
  ["No shortcode authority", "Every platform's list already disagrees. CLDR names are the shared vocabulary, and name carries them."],
  ["No drawing rules", "Style, palette and whether a flag waves are the set's business. The spec fixes names and facts, not looks."],
  ["No animation rules in 0.1", "An apng or webp path may animate. Timing, loops and reduced motion come later."],
  ["No required licence", "A set must say its licence. It need not be open."]
];

export default function OpenEmojiPage(): ReactNode {
  return (
    <SiteShell active="OpenEmoji">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenEmoji</h2>
          <p>
            An emoji set as a folder: one descriptor that says what it covers and what made it, and
            glyphs named by the codepoints they draw. Any site can render any set.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every emoji a reader sees is drawn by whoever made their operating system, and a site that
          wants its own look has no agreed shape to ship one in. Custom emoji are worse: Slack,
          Discord and Mastodon each keep theirs behind their own API. And now that an image model can
          draw a whole set in an afternoon, a reader deserves to know whether a person, a model or
          both drew the thumbs-up in front of them.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Files first and <code style={mono}>made_by</code> on the work, like{" "}
          <Link href="/openwiki">OpenWiki</Link>.
        </p>
        <p>
          <Link href="/openemoji/catalog" className="button-primary">
            Browse the whole set: 3,963 emoji
          </Link>
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>A set drawn to the spec</h2>
          <p>
            From the reference implementation: every glyph drawn by gpt-image-2 under one art
            direction. The skin tones are edits of their base, which is why the two thumbs are the
            same thumb. <Link href="/openemoji/catalog">The catalog</Link> has all of them, with
            search and filters.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            gap: "0.5rem"
          }}
        >
          {SAMPLE.map(([key, char, name]) => (
            <figure
              key={key}
              style={{
                margin: 0,
                padding: "0.7rem 0.3rem 0.5rem",
                border: "1px solid #e3e6e0",
                borderRadius: "0.6rem",
                background: "#fff",
                textAlign: "center"
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="openemoji"
                src={`/openemoji/${key}.png`}
                alt={char}
                title={name}
                width={56}
                height={56}
                loading="lazy"
              />
              <figcaption
                style={{
                  fontSize: "0.7rem",
                  color: "#5b6b7a",
                  marginTop: "0.3rem",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {key}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
          <p>openemoji.json, trimmed to three entries: a glyph, its skin-tone variant, a custom emoji.</p>
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
            A <code style={mono}>{'<link rel="openemoji" href="/emoji/openemoji.json">'}</code> in a
            page's head, or <code style={mono}>/.well-known/openemoji.json</code> on a site, which is
            either a set or a list of the sets it offers. Served as JSON with CORS open, because the
            point is that other sites read it.
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Custom emoji, from where they live now</h2>
          <p>Importing is a fetch and a rename. Nothing in 0.1 has a field these cannot carry back.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenEmoji</th>
              <th style={th}>Mastodon</th>
              <th style={th}>Slack</th>
              <th style={th}>Discord</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map(([ours, mastodon, slack, discord]) => (
              <tr key={ours}>
                <td style={td}>
                  <code style={mono}>{ours}</code>
                </td>
                <td style={td}>{mastodon}</td>
                <td style={td}>{slack}</td>
                <td style={td}>{discord}</td>
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
          <h2>Draw a set</h2>
          <p>
            <code style={mono}>emoji</code> in{" "}
            <a href="https://github.com/profullstack/cli-tools">profullstack/cli-tools</a> draws every
            fully-qualified emoji in Unicode&apos;s list and writes the folder above: PNGs from 16 to
            512, SVGs, CBDT and sbix colour fonts, CSS and openemoji.json.
          </p>
        </div>
        <pre style={pre}>{`emoji generate --only 😀🔥🇯🇵👍🏽   # a handful, to judge the style
emoji generate                      # all 3,963; resumable
emoji build                         # sizes, SVGs, fonts, manifest`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/openemoji/catalog">Catalog</Link>: every emoji in the reference set, with
            search, group, skin tone, version and status filters
          </li>
          <li>
            <Link href="/docs/openemoji">Specification</Link>: the shape, eight rules, discovery, the
            mapping from Mastodon, Slack, Discord and CLDR
          </li>
          <li>
            <Link href="/docs/openwebring">OpenWebring</Link> and <Link href="/openwiki">OpenWiki</Link>{" "}
            for made_by and the disclosure vocabulary; <Link href="/openprofile">OpenProfile.md</Link>{" "}
            for author
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
