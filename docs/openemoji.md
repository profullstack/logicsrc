# OpenEmoji

OpenEmoji is an emoji set as a folder: one `openemoji.json` at the top that says what the set covers, who or what drew it and under which licence, and image files named by the codepoints they draw. Any site, app or agent can render any set from it, standard Unicode emoji and a community's custom ones alike, without a vendor font and without a platform's private API. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Written in the spirit of [OpenWiki](/openwiki): files first, one small descriptor, and `made_by` on the work.

Slug: `openemoji`

## The problem

Every emoji a reader sees is drawn by whoever made their operating system. The same message shows Apple's 😂 on one phone, Google's on another, and a box with a question mark on a Linux server whose font is two Emoji versions old. A site that wants its own look has to ship a set, and there is no agreed shape for one: Twemoji, Noto, OpenMoji and Fluent each name their files differently, none of them says in a machine-readable way how much of Unicode it covers, and none of them says what made it.

Custom emoji are worse. Slack, Discord, Mastodon and Misskey each keep their own list behind their own API, with their own fields for the same five facts (a name, an image, a category, whether it animates, whether it is shown in the picker). A community that moves loses its emoji.

Image models make the gap wider. A complete, coherent set can now be drawn in an afternoon, and a reader deserves to know whether the thumbs-up in front of them was drawn by a person, a model, or both.

## The shape

```
openemoji.json          the descriptor (rule 1)
png/<size>/<key>.png    raster glyphs, one folder per size
svg/<key>.svg           vector glyphs, when the set has them
font/<Family>-CBDT.ttf  colour fonts, when the set has them
openemoji.css           @font-face and an img rule, optional
```

```json
{
  "openemoji": "0.1",
  "name": "OpenEmoji",
  "version": "2026-09-24",
  "license": "CC-BY-4.0",
  "author": "Profullstack, Inc.",
  "unicode": "18.0",
  "made_by": "ai",
  "disclosure": "ai-generated",
  "ai_model": "gpt-image-2",
  "ai_provider": "OpenAI",
  "ai_prompt_url": "style.txt",
  "sizes": [16, 20, 32, 48, 64, 72, 96, 128, 136, 160, 256, 512],
  "formats": ["png", "svg", "cbdt", "sbix"],
  "fonts": [
    { "format": "cbdt", "path": "font/OpenEmoji-CBDT.ttf" },
    { "format": "sbix", "path": "font/OpenEmoji-sbix.ttf" }
  ],
  "css": "openemoji.css",
  "coverage": { "total": 3963, "drawn": 3963, "missing": [] },
  "emoji": [
    {
      "key": "1f44d",
      "char": "👍",
      "name": "thumbs up",
      "group": "People & Body",
      "subgroup": "hand-fingers-closed",
      "unicode": "0.6",
      "svg": "svg/1f44d.svg",
      "png": "png/{size}/1f44d.png"
    },
    {
      "key": "1f44d-1f3fd",
      "char": "👍🏽",
      "name": "thumbs up: medium skin tone",
      "group": "People & Body",
      "subgroup": "hand-fingers-closed",
      "unicode": "1.0",
      "base": "1f44d",
      "svg": "svg/1f44d-1f3fd.svg",
      "png": "png/{size}/1f44d-1f3fd.png"
    },
    {
      "key": "x-shipit",
      "shortcodes": ["shipit", "squirrel"],
      "name": "ship it",
      "group": "Custom",
      "keywords": ["deploy", "release"],
      "png": "png/{size}/x-shipit.png"
    }
  ]
}
```

That is the set the reference implementation drew, trimmed to three entries, plus one custom emoji to show the shape.

## The rules

There are eight, and every one of them degrades rather than fails.

**1. A set is a folder with `openemoji.json` at its root.** Every path in the descriptor is relative to that file. The same folder works on a disk, in a git repository, behind a CDN, or inside an npm package. Top-level keys a reader should understand: `openemoji` (the spec version, required), `name` (required), `version`, `license` (an SPDX identifier), `author` (a name or an [OpenProfile.md](/openprofile) URL), `homepage`, `unicode` (the Emoji version the set was drawn against), `sizes`, `formats`, `fonts`, `css`, `coverage` and `emoji` (required). Unknown keys are kept and ignored.

**2. A standard emoji's key is its fully-qualified codepoint sequence.** Lowercase hexadecimal, joined by hyphens, exactly as Unicode's `emoji-test.txt` lists the fully-qualified form: `2764-fe0f` for ❤️, `1f469-1f3fe-200d-1f4bb` for 👩🏾‍💻, `1f1ef-1f1f5` for 🇯🇵. The key is also the file name. A reader looking up text a person typed tries the exact sequence first and then the same sequence with every `FE0F` removed from both sides, because people and keyboards leave the selector out. `char` holds the emoji itself and `name` its CLDR short name, both copied from Unicode, not paraphrased.

**3. A custom emoji's key starts with `x-`.** `x-` followed by lowercase letters, digits, `_` or `-`. It has no `char`, one or more `shortcodes` (without colons), a `name`, and `group: "Custom"` unless the set groups its own. A shortcode belongs to its set: two sets may both define `:shipit:`, and an app that loads both decides which wins. No `x-` key may be used for something Unicode has encoded; when Unicode encodes it, the set adds the standard key and may keep the custom one as an alias.

**4. Files are named by key, and the descriptor says where.** An entry's `png` is a path that may contain `{size}`, filled in from the set's `sizes`; `svg` is a path; a set may add `webp`, `avif` or `apng` the same way. A reader picks the smallest size at least as large as the rendered size times the device pixel ratio, and the largest when none is. Fonts are listed once for the set with their colour format (`cbdt`, `sbix`, `colrv1`, `ot-svg`), because a browser picks among them by what it supports, not per emoji.

**5. Coverage is stated, not implied.** `coverage.total` is the number of standard emoji in the Unicode version the set names, `coverage.drawn` how many of them it has, and `coverage.missing` their keys. A reader that meets an emoji the set does not have falls back to the platform's own, never to a blank or a box. A set that draws only faces is a valid set; it only has to say so.

**6. A variant names its base.** A skin-tone sequence carries `base`, the key of the same emoji without the tone (`1f44d-1f3fd` has `base: "1f44d"`). That one field is enough for any picker to group tones under their emoji and to offer a tone switch from any set, and it lets a set drawn by a model say that its variants were derived from one drawing rather than drawn five times.

**7. The set says what made it.** `made_by` is `human`, `ai` or `both`, the [OpenWebring](/docs/openwebring) vocabulary. `disclosure` is the W3C AI Content Disclosure vocabulary verbatim (`none`, `ai-assisted`, `ai-generated`, `autonomous`, and `mixed` at the set level), and `ai_model`, `ai_provider` and `ai_prompt_url` are the rest of it: which model, whose, and a file or page describing how it was asked. Any of the five may be repeated on an entry that differs from the set, for instance a hand-corrected flag in a set that is otherwise `ai-generated`. It is a self-declaration and nothing verifies it.

**8. Rendered emoji stay text.** An emoji shown as an image is `<img class="openemoji" src="…" alt="👍" title="thumbs up">`: `alt` is the character itself, so copying the text copies the emoji and a screen reader reads its name, and `title` is the CLDR name. When a set ships a font, `font-family` with the set's name first and the platform fonts after it does the same job with no images at all; `css` points at a stylesheet that declares both.

## Discovery

A set is found three ways, and a reader tries them in this order:

- A `<link rel="openemoji" href="/emoji/openemoji.json">` in a page's head: this page renders emoji with that set.
- `/.well-known/openemoji.json` on a site: either a set itself, or a list of the sets the site offers, `{"openemoji": "0.1", "sets": [{"name": "…", "url": "…/openemoji.json"}]}`. A community server's custom emoji live here.
- A URL someone hands over. The descriptor is plain JSON served as `application/json` with CORS open (`Access-Control-Allow-Origin: *`), because the point is that other sites read it.

## Mapping from what exists

| OpenEmoji | Mastodon `custom_emojis` | Slack `emoji.list` | Discord emoji | Unicode / CLDR |
|---|---|---|---|---|
| `key` | none (shortcode is the id) | none (name is the id) | `id` | codepoint sequence |
| `shortcodes[0]` | `shortcode` | the map's key | `name` | none |
| `png` | `url`, `static_url` | the map's value | CDN URL from `id` | none |
| `group` | `category` | none | none | group, subgroup |
| `name` | none | none | none | CLDR short name |
| `keywords` | none | none | none | CLDR annotations |
| `apng` present | `url` differs from `static_url` | none | `animated` | none |
| absent from the picker | `visible_in_picker: false` | none | `available: false` | none |

Importing from any of them is a fetch and a rename: shortcode to `x-` key, image to `png/<size>/`. Exporting back is the reverse, and nothing in 0.1 has a field those four cannot carry.

## What is deliberately absent

- **No registry.** A set is wherever its descriptor is. A directory of sets can be built by anyone reading `/.well-known/openemoji.json`.
- **No shortcode authority.** Shortcodes for standard emoji are not standardised here, because every platform's list already disagrees; CLDR names are the one shared vocabulary and `name` carries them.
- **No drawing rules.** Style, palette, proportions and whether a flag waves are the set's business. The spec fixes names and facts, not looks.
- **No animation rules in 0.1.** An `apng` or `webp` path may point at an animated file; timing, loops and reduced-motion are for a later version.
- **No required licence.** A set must say its licence; it need not be open.

## Reference implementation

`emoji` in [profullstack/cli-tools](https://github.com/profullstack/cli-tools) draws a complete set with an image model and packs it as above:

```sh
emoji generate --only 😀🔥🇯🇵👍🏽   # draw a handful, judge the style
emoji generate                      # every fully-qualified sequence in emoji-test.txt
emoji build                         # PNG sizes, SVGs, CBDT + sbix fonts, CSS, openemoji.json
```

It follows rules 6 and 7 as a design choice, not only as fields. Six anchors are drawn first and every later glyph is an edit that sees them, so 3,963 glyphs share one light and one gloss. Every skin-tone variant is an edit of its `base` that changes the skin and nothing else. The descriptor it writes says `made_by: ai`, `disclosure: ai-generated`, the model, and points `ai_prompt_url` at the art direction it used.

Related: [OpenWebring](/docs/openwebring) and [OpenWiki](/docs/openwiki) for `made_by` and the disclosure vocabulary; [OpenProfile.md](/openprofile) for `author`; [OpenFile](/docs/openfile) for serving the folder.
