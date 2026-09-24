# OpenIcon

OpenIcon is an icon set as a folder: one `openicon.json` at the top that names every icon, says where its files are and who or what drew it, and gives each icon three terminal glyphs, so the same `mail` icon is an SVG in a browser, a PNG in an email, 󰇰 in a terminal with a Nerd Font, ✉ in one without, and `@` over a serial line. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A sibling of [OpenEmoji](/openemoji): files first, one small descriptor, `made_by` on the work.

Slug: `openicon`

## The problem

Every interface needs the same few hundred icons: mail, phone, link, search, settings, a trash can, a GitHub logo. Every icon set ships them under its own names (Lucide's `mail` is Font Awesome's `envelope` is Material's `email`), in its own folder layout, with its licence in a README, and with brand logos mixed in beside drawn icons as if a trademark were just another shape.

Terminals are worse. A TUI that wants an icon has three choices, all bad: hard-code a Nerd Font codepoint and show a box on every terminal without one, hard-code an emoji and break the column width, or draw nothing. No icon set says what an icon should be when there are no pixels at all.

## The shape

```
openicon.json          the descriptor (rule 1)
svg/<key>.svg          24x24, currentColor
png/<size>/<key>.png   rendered from the SVG
sprite.svg             every icon as a <symbol>, optional
```

```json
{
  "openicon": "0.1",
  "name": "OpenIcon",
  "version": "2026-09-24",
  "license": "MIT",
  "made_by": "ai",
  "disclosure": "ai-generated",
  "ai_model": "claude-opus-5-5",
  "ai_provider": "Anthropic",
  "grid": { "size": 24, "stroke": 2, "padding": 2 },
  "sizes": [16, 20, 24, 32, 48, 64, 128, 256],
  "sprite": "sprite.svg",
  "icons": [
    {
      "key": "mail",
      "name": "Mail",
      "category": "communication",
      "aliases": ["email", "envelope"],
      "keywords": ["message", "inbox"],
      "svg": "svg/mail.svg",
      "png": "png/{size}/mail.png",
      "tui": { "nerd": "󰇰", "nerd_code": "f01f0", "nerd_name": "md-email_outline", "unicode": "✉", "ascii": "@" }
    },
    {
      "key": "github",
      "name": "GitHub",
      "category": "brand",
      "brand": true,
      "trademark": "GitHub and its logo are trademarks of their owner. Use them to refer to GitHub, not to imply endorsement.",
      "source": "simple-icons:github",
      "license": "CC0-1.0",
      "made_by": "human",
      "svg": "svg/github.svg",
      "png": "png/{size}/github.png",
      "tui": { "nerd": "󰊤", "nerd_code": "f02a4", "nerd_name": "md-github", "unicode": "🐙", "ascii": "gh" }
    }
  ]
}
```

Two entries from the reference set: a drawn icon and a brand logo.

## The rules

There are eight for the canonical style, three more for the optional HQ style, and every one of them degrades rather than fails.

**1. A set is a folder with `openicon.json` at its root.** Every path is relative to that file. Top-level keys a reader should understand: `openicon` (the spec version, required), `name` (required), `version`, `license` (SPDX, covering every icon without its own), `homepage`, `grid`, `sizes`, `sprite` and `icons` (required). Unknown keys are kept and ignored.

**2. An icon's key is its name, in kebab case.** Lowercase letters and digits joined by single hyphens: `mail`, `git-pull-request`, `arrow-up-right`. The key is also the file name. A brand's key is the brand's own name in the same form (`github`, `stack-overflow`), never a product code.

**3. Aliases find one icon; keywords find many.** `aliases` are other names people type for the icon (`email` for `mail`, `trash` for `delete`), and every key and alias in a set is unique, so `icon('email')` is never ambiguous. `keywords` are search terms and may be shared (`money` finds `wallet`, `dollar` and `coins`). A reader resolves a name against keys first, then aliases.

**4. Files are monochrome and take the text colour.** An SVG uses `currentColor` for every stroke and fill and a `0 0 24 24` view box. `grid` states the drawing rules the set keeps (`size`, `stroke` width, `padding`), so a reader mixing sets can scale one to match another. `png` may contain `{size}`, filled from `sizes`; PNGs are rendered in one colour, which the set's README states. A set without PNGs or without a sprite is still a set.

**5. Every icon has terminal glyphs.** `tui.unicode` is one character or emoji that says the same thing, and `tui.ascii` is 1 to 4 printable ASCII characters, spaces only inside (`[ ]`, `>_`, `@`). `tui.nerd` is the Nerd Font character when there is one, with `nerd_code` (hex) and `nerd_name` (the Nerd Fonts glyph name, without `nf-`), so a reader can check it against the Nerd Fonts release it has. An icon with no Nerd Font glyph leaves the three `nerd` fields out.

**6. A terminal picks the best glyph it can draw.** Nerd first, then Unicode, then ASCII. A Nerd Font cannot be detected from inside a terminal, so a reader takes it from configuration: `OPENICON_GLYPHS=nerd|unicode|ascii` wins, `NERD_FONT=1` means nerd, a UTF-8 locale means unicode, anything else means ascii. A reader that reserves a fixed cell width pads to it, because an emoji may be two columns wide where a Nerd glyph is one.

**7. A brand says it is one.** A logo carries `brand: true`, a `trademark` note, its `source` (`simple-icons:<slug>`, `font-awesome:<name>`, or a URL) and its own `license`, because the licence of a drawing is not permission to use a mark. Brand logos are taken from their owners or from a set that publishes them; a set does not redraw them.

**8. The set says what made it.** `made_by` is `human`, `ai` or `both`, the [OpenWebring](/docs/openwebring) vocabulary, and `disclosure`, `ai_model`, `ai_provider` and `ai_prompt_url` are the W3C AI Content Disclosure vocabulary, as in [OpenEmoji](/docs/openemoji). Any of them may be repeated on an icon that differs from the set: in the reference set the drawn icons are `ai` and every brand logo is `human`.

## Styles: simple and HQ

A set has one canonical style, **simple**: the monochrome, `currentColor` files the rules above describe. It may add an optional second style, **HQ**: the same icons in full colour, drawn to a higher finish for places where an icon is shown large or alone (a launcher, an empty state, a marketing page). HQ never replaces simple; a reader that knows nothing about it loses nothing.

**9. HQ is optional, per icon, and follows simple.** A set with an HQ style says so at the top level, `"styles": ["simple", "hq"]`, and describes it once:

```json
"hq": {
  "sizes": [16, 20, 24, 32, 48, 64, 128, 256],
  "webp_sizes": [64, 128],
  "made_by": "both",
  "ai_model": "gpt-image-2",
  "ai_provider": "OpenAI",
  "ai_prompt_url": "hq/style.txt",
  "coverage": { "total": 370, "done": 370 }
}
```

Each icon that has it carries an `hq` block with its own files and provenance:

```json
"hq": { "png": "hq/png/{size}/mail.png", "webp": "hq/webp/{size}/mail.webp", "made_by": "ai" }
"hq": { "png": "hq/png/{size}/github.png", "webp": "hq/webp/{size}/github.webp", "svg": "hq/svg/github.svg",
        "made_by": "human", "hex": "#181717", "hex_source": "simple-icons:github" }
```

An HQ icon depicts what its simple icon depicts, with the same silhouette, so a reader can swap one for the other without a layout changing meaning. An icon without an `hq` block falls back to simple. HQ files carry their own colour and never use `currentColor`.

**10. A brand's colour is its owner's.** An HQ brand logo is the simple logo in the owner's published colour, never a redrawing and never a guess: `hex` is that colour and `hex_source` says where it is published (a Simple Icons slug, or the brand's own guidelines page). A logo whose owner publishes no colour has no HQ form.

**11. Provenance is per style.** `made_by`, `disclosure` and the `ai_*` fields on the `hq` block describe the HQ files, not the simple ones. In the reference set, simple icons are authored as SVG and HQ icons are drawn by an image model from them, so the same icon is `ai` in one style and says so in each.

## Discovery

- A `<link rel="openicon" href="/icons/openicon.json">` in a page's head: this page draws its icons from that set.
- `/.well-known/openicon.json` on a site: a set, or a list of sets, `{"openicon": "0.1", "sets": [{"name": "…", "url": "…/openicon.json"}]}`.
- A package: a set published to npm, PyPI or a git repository keeps `openicon.json` at the package root. Served as JSON with CORS open.

## Mapping from what exists

| OpenIcon | Lucide | Tabler | Font Awesome | Nerd Fonts | Simple Icons |
|---|---|---|---|---|---|
| `key` | icon name | icon name | icon name | glyph name after the prefix | slug |
| `aliases` | `aliases` in the icon's JSON | none | `aliases.names` | none | `aliases.aka` |
| `keywords` | `tags` | `tags` | `search.terms` | none | none |
| `category` | `categories` | `category` | `categories` | the font the glyph came from | none |
| `grid` | 24, stroke 2 | 24, stroke 2 | 512 tall, filled | a font cell | 24, filled |
| `tui.nerd` | none | none | the codepoint, in a patched font | the codepoint | none |
| `brand` | none (no brands) | a few, unmarked | the `brands` style | some, unmarked | every icon |
| `license` per icon | none | none | per style | none | one for all (CC0) |

An importer from any of these is a rename and a copy. Only `tui.unicode` and `tui.ascii` need a person or a model to write them, because none of the sets carries them.

## What is deliberately absent

- **No colour in the canonical style.** Simple icons are monochrome and take the text colour. Colour lives only in the optional HQ style (rules 9 to 11).
- **No style variants.** Outline, filled and duotone versions of one icon are three sets, or three icons with three keys. One key, one drawing.
- **No icon font format.** A webfont is a build output a set may ship, not part of the spec; the SVGs and the `tui` glyphs are the interchange.
- **No registry of names.** Keys are the set's own. Aliases are how one set answers to another's names.
- **No animation.** A spinner is a component, not an icon.

## Reference implementation

The reference set is [profullstack/openicon](https://github.com/profullstack/openicon): 370 icons, 259 drawn on a 24x24 grid with 2px strokes and 111 brand logos from Simple Icons and Font Awesome Free. 357 of them have a Nerd Font glyph. It is built by `icon` in [profullstack/cli-tools](https://github.com/profullstack/cli-tools):

```sh
icon build --out ./openicon   # openicon.json, svg/, png/, sprite.svg
icon glyph mail               # 󰇰, ✉ or @, whichever this terminal can draw
```

[hqtui](https://hqtui.com) ships the set as its default icon pack, so `icon('mail')` in a TUI draws the best glyph the terminal has.

Related: [OpenEmoji](/docs/openemoji) for the sibling format; [OpenWebring](/docs/openwebring) for `made_by`.
