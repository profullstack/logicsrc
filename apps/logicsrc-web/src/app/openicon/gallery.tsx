"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./gallery.module.css";
import { GALLERY_SET, OPENICON_RAW } from "./set";

/**
 * The OpenIcon reference set, filterable, with the terminal view beside the
 * vector one: every icon can be shown as its SVG or as the glyph hqtui's
 * icon() would print (Nerd Font, Unicode or ASCII), which is the point of
 * the spec's tui block.
 *
 * Icons are drawn as CSS masks over the chosen colour, the same way
 * currentColor would colour them inline, without 370 inline SVGs.
 * Filters live in the query string.
 */

type Icon = {
  key: string;
  name: string;
  category: string;
  aliases?: string[];
  keywords?: string[];
  brand?: boolean;
  trademark?: string;
  source?: string;
  license?: string;
  made_by?: string;
  svg: string;
  png?: string;
  /** The first colour style, under the name it shipped with; also in `styles`. */
  hq?: StyleFiles;
  /** Every colour style this icon has, by style id. Simple stays canonical. */
  styles?: Record<string, StyleFiles>;
  tui?: { nerd?: string; nerd_code?: string; nerd_name?: string; unicode?: string; ascii?: string };
};

type StyleFiles = { png?: string; webp?: string; svg?: string; made_by?: string; hex?: string };

type StyleInfo = { label?: string; material?: string; dir?: string; ground?: "light" | "dark" | "any" };

type IconSet = {
  name: string;
  version: string;
  license: string;
  sizes: number[];
  categories: Record<string, string>;
  /** simple first, then the colour styles in the order the set added them. */
  styles?: string[];
  style_info?: Record<string, StyleInfo>;
  icons: Icon[];
};

type View = "svg" | "nerd" | "unicode" | "ascii";

const VIEWS: Array<[View, string]> = [
  ["svg", "SVG"],
  ["nerd", "Nerd Font"],
  ["unicode", "Unicode"],
  ["ascii", "ASCII"]
];

type Filters = {
  q: string;
  /** "simple" is the line icon in the chosen colour; anything else is a style id. */
  style: string;
  category: string;
  kind: "" | "ui" | "brand";
  view: View;
  size: number;
  color: string;
};

const DEFAULTS: Filters = { q: "", style: "simple", category: "", kind: "", view: "svg", size: 32, color: "#101418" };

/** A style id is a key in the set; keep the query string from becoming a path. */
const isStyleId = (value: string): boolean => /^[a-z0-9][a-z0-9-]{0,30}$/.test(value);

/** The colour styles an icon actually has, oldest name first. */
function stylesOf(icon: Icon): Record<string, StyleFiles> {
  return { ...(icon.hq ? { hq: icon.hq } : {}), ...icon.styles };
}

function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const view = p.get("view") as View | null;
  const kind = p.get("kind");
  const size = Number(p.get("size"));
  const color = p.get("color");
  const style = p.get("style") ?? "";
  return {
    q: p.get("q") ?? "",
    style: style && style !== "simple" && isStyleId(style) ? style : "simple",
    category: p.get("category") ?? "",
    kind: kind === "ui" || kind === "brand" ? kind : "",
    view: view && VIEWS.some(([v]) => v === view) ? view : "svg",
    size: size >= 16 && size <= 96 ? size : DEFAULTS.size,
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULTS.color
  };
}

function writeFilters(f: Filters, selected: string | null): void {
  const p = new URLSearchParams(window.location.search);
  for (const key of ["q", "style", "category", "kind", "view", "size", "color", "icon"]) p.delete(key);
  if (f.q) p.set("q", f.q);
  if (f.style !== "simple") p.set("style", f.style);
  if (f.category) p.set("category", f.category);
  if (f.kind) p.set("kind", f.kind);
  if (f.view !== "svg") p.set("view", f.view);
  if (f.size !== DEFAULTS.size) p.set("size", String(f.size));
  if (f.color !== DEFAULTS.color) p.set("color", f.color);
  if (selected) p.set("icon", selected);
  const query = p.toString();
  window.history.replaceState(null, "", `${query ? `?${query}` : window.location.pathname}${window.location.hash}`);
}

const glyphOf = (icon: Icon, view: View): string => {
  const t = icon.tui ?? {};
  if (view === "nerd") return t.nerd ?? t.unicode ?? t.ascii ?? "";
  if (view === "unicode") return t.unicode ?? t.ascii ?? "";
  return t.ascii ?? "";
};

const maskStyle = (icon: Icon, color: string, size: number): CSSProperties => {
  const url = `url("${GALLERY_SET}/${icon.svg}")`;
  return {
    width: size,
    height: size,
    background: color,
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center"
  };
};

/** One colour style's artwork for an icon at a size, or null when it has none. */
const artSrc = (icon: Icon, style: string, size: number): string | null => {
  const files = stylesOf(icon)[style];
  if (!files) return null;
  if (files.svg) return `${GALLERY_SET}/${files.svg}`;
  const template = files.webp ?? files.png;
  return template ? `${GALLERY_SET}/${template.replace("{size}", String(size > 64 ? 128 : 64))}` : null;
};

function Art({ icon, style, color, size }: { icon: Icon; style: string; color: string; size: number }): ReactNode {
  const src = style === "simple" ? null : artSrc(icon, style, size * 2);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={icon.name} width={size} height={size} loading="lazy" decoding="async" />;
  }
  return <span role="img" aria-label={icon.name} style={maskStyle(icon, color, size)} />;
}

export function Gallery(): ReactNode {
  const [set, setSet] = useState<IconSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readFilters();
    setFilters(initial);
    setQuery(initial.q);
    setSelected(new URLSearchParams(window.location.search).get("icon"));
    setReady(true);
    fetch(`${GALLERY_SET}/openicon.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<IconSet>;
      })
      .then(setSet)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (ready) writeFilters(filters, selected);
  }, [filters, selected, ready]);

  const update = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const hay = useMemo(
    () =>
      new Map(
        (set?.icons ?? []).map((i) => [
          i.key,
          [i.key, i.name, i.category, ...(i.aliases ?? []), ...(i.keywords ?? []), i.tui?.nerd_name ?? ""]
            .join(" ")
            .toLowerCase()
        ])
      ),
    [set]
  );

  const matches = useCallback(
    (i: Icon, skipCategory = false): boolean => {
      if (!skipCategory && filters.category && i.category !== filters.category) return false;
      if (filters.kind === "brand" && !i.brand) return false;
      if (filters.kind === "ui" && i.brand) return false;
      if (filters.q) {
        const h = hay.get(i.key) ?? "";
        for (const word of filters.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!h.includes(word)) return false;
      }
      return true;
    },
    [filters, hay]
  );

  const results = useMemo(() => (set ? set.icons.filter((i) => matches(i)) : []), [set, matches]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of set?.icons ?? []) if (matches(i, true)) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [set, matches]);

  const current = selected && set ? (set.icons.find((i) => i.key === selected) ?? null) : null;

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelected(null);
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const at = results.findIndex((i) => i.key === current.key);
      const next = results[at + (event.key === "ArrowRight" ? 1 : -1)];
      if (at !== -1 && next) {
        event.preventDefault();
        setSelected(next.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, results]);

  if (error) return <p className={styles.notice}>The set could not be loaded ({error}).</p>;
  if (!set) return <p className={styles.notice}>Loading the set…</p>;

  const brands = set.icons.filter((i) => i.brand).length;
  // The colour styles the set actually ships, in its own order, with how many
  // icons each covers: a style the set lists but has not drawn yet is not a tab.
  const colourStyles = (set.styles ?? (set.icons.some((i) => i.hq) ? ["simple", "hq"] : ["simple"]))
    .filter((id) => id !== "simple")
    .map((id) => ({
      id,
      count: set.icons.filter((i) => stylesOf(i)[id]).length,
      label: set.style_info?.[id]?.label ?? id,
      material: set.style_info?.[id]?.material ?? "A full-colour style"
    }))
    .filter((s) => s.count > 0);
  const terminal = filters.view !== "svg";
  // A style may say it needs a dark ground, and emissive does: its near-black
  // bodies and the marks that emit neutral white are invisible on a white
  // tile. The set is the only thing that knows, so honour what it says rather
  // than guessing from the style id.
  const darkGround = !terminal && set.style_info?.[filters.style]?.ground === "dark";
  const active = filters.q || filters.category || filters.kind;

  return (
    <div className={styles.gallery}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder={`Search ${set.icons.length} icons: mail, email, github, arrow…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search icons"
        />

        <div className={styles.controls}>
          {colourStyles.length ? (
            <div className={styles.segmented} role="group" aria-label="Style">
              {[
                { id: "simple", label: "Simple", material: "The line icon, in any colour", count: set.icons.length },
                ...colourStyles
              ].map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={filters.style === s.id && filters.view === "svg" ? styles.segOn : styles.seg}
                  onClick={() => setFilters((f) => ({ ...f, style: s.id, view: "svg" }))}
                  title={s.material}
                >
                  {s.id === "simple" ? s.label : `${s.label} ${s.count}`}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.segmented} role="group" aria-label="Show as">
            {VIEWS.map(([v, label]) => (
              <button
                type="button"
                key={v}
                className={filters.view === v ? styles.segOn : styles.seg}
                onClick={() => update("view", v)}
                title={v === "svg" ? "The vector icon" : `The ${label} glyph hqtui's icon() prints`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.segmented} role="group" aria-label="Kind">
            {(
              [
                ["", `All ${set.icons.length}`],
                ["ui", `UI ${set.icons.length - brands}`],
                ["brand", `Brands ${brands}`]
              ] as const
            ).map(([k, label]) => (
              <button
                type="button"
                key={k || "all"}
                className={filters.kind === k ? styles.segOn : styles.seg}
                onClick={() => update("kind", k)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={styles.control}>
            <span>Size {filters.size}px</span>
            <input
              type="range"
              min={16}
              max={96}
              step={4}
              value={filters.size}
              onChange={(e) => update("size", Number(e.target.value))}
            />
          </label>
          {!terminal && filters.style === "simple" ? (
            <label className={styles.control}>
              <span>Colour</span>
              <input type="color" value={filters.color} onChange={(e) => update("color", e.target.value)} />
            </label>
          ) : null}
          <span className={styles.count}>
            {results.length} {results.length === 1 ? "icon" : "icons"}
            {active ? (
              <button
                type="button"
                className={styles.reset}
                onClick={() => {
                  setQuery("");
                  setFilters((f) => ({ ...DEFAULTS, view: f.view, size: f.size, color: f.color }));
                }}
              >
                Reset
              </button>
            ) : null}
          </span>
        </div>

        <div className={styles.chips} role="group" aria-label="Category">
          <button
            type="button"
            className={!filters.category ? styles.chipOn : styles.chip}
            onClick={() => update("category", "")}
          >
            All categories
          </button>
          {Object.entries(set.categories).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={filters.category === key ? styles.chipOn : styles.chip}
              onClick={() => update("category", filters.category === key ? "" : key)}
            >
              {label} <small>{counts.get(key) ?? 0}</small>
            </button>
          ))}
        </div>
      </div>

      {terminal ? (
        <p className={styles.hint}>
          What <code>icon(&quot;{current?.key ?? "mail"}&quot;)</code> prints in hqtui with the glyph mode set to{" "}
          <strong>{filters.view}</strong>
          {filters.view === "nerd" ? " (Nerd Font symbols served subset from this page)" : ""}.
        </p>
      ) : filters.style !== "simple" ? (
        <p className={styles.hint}>
          <strong>{set.style_info?.[filters.style]?.label ?? filters.style}</strong>{" "}
          {set.style_info?.[filters.style]?.material ?? "A full-colour style."} Simple stays canonical: a colour style is
          a material over the same drawing, never a second drawing of it.
        </p>
      ) : null}

      {results.length === 0 ? (
        <p className={styles.notice}>Nothing matches. Try an alias (email, trash) or fewer words.</p>
      ) : (
        <ul
          className={`${styles.grid} ${terminal || darkGround ? styles.gridTerminal : ""}`}
          style={{ ["--tile" as string]: `${filters.size}px` }}
        >
          {results.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                className={`${styles.tile} ${selected === i.key ? styles.tileOn : ""} ${
                  filters.view === "nerd" && !i.tui?.nerd ? styles.fallback : ""
                }`}
                onClick={() => setSelected(i.key)}
                title={filters.view === "nerd" && !i.tui?.nerd ? `${i.name}: no Nerd Font glyph, Unicode shown` : i.name}
              >
                {terminal ? (
                  <span
                    className={filters.view === "nerd" ? styles.glyphNerd : styles.glyph}
                    style={{ fontSize: filters.size * 0.8 }}
                  >
                    {glyphOf(i, filters.view)}
                  </span>
                ) : (
                  <Art icon={i} style={filters.style} color={filters.color} size={filters.size} />
                )}
                <span className={styles.label}>{i.key}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current ? (
        <Detail icon={current} set={set} color={filters.color} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function Detail({ icon, set, color, onClose }: { icon: Icon; set: IconSet; color: string; onClose: () => void }): ReactNode {
  const [svgText, setSvgText] = useState("");
  useEffect(() => {
    setSvgText("");
    fetch(`${GALLERY_SET}/${icon.svg}`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => setSvgText(t.trim()))
      .catch(() => setSvgText(""));
  }, [icon.svg]);

  const t = icon.tui ?? {};
  const colourIds = Object.keys(stylesOf(icon));
  const img = `<img src="${OPENICON_RAW}/${icon.svg}" alt="${icon.name}" width="24" height="24">`;
  return (
    <aside className={styles.detail} aria-label={`${icon.name} details`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <span role="img" aria-label={icon.name} style={maskStyle(icon, color, 96)} />
          <div className={styles.heroSmall}>
            {[16, 24, 32].map((size) => (
              <span key={size} style={maskStyle(icon, color, size)} />
            ))}
          </div>
        </div>
        {colourIds.length ? (
          <div className={styles.heroStyles}>
            {colourIds.map((id) => (
              // Each tile carries its own ground: side by side, a dark-only
              // style next to three light ones would otherwise show nothing.
              <div
                className={`${styles.heroHq} ${set.style_info?.[id]?.ground === "dark" ? styles.heroHqDark : ""}`}
                key={id}
              >
                <Art icon={icon} style={id} color={color} size={64} />
                <span>{set.style_info?.[id]?.label ?? id}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <h3>{icon.name}</h3>
      <dl className={styles.facts}>
        <dt>Key</dt>
        <dd>
          <code>{icon.key}</code>
        </dd>
        {icon.aliases?.length ? (
          <>
            <dt>Aliases</dt>
            <dd>{icon.aliases.join(", ")}</dd>
          </>
        ) : null}
        <dt>Category</dt>
        <dd>{set.categories[icon.category] ?? icon.category}</dd>
        {icon.brand ? (
          <>
            <dt>Source</dt>
            <dd>
              {icon.source} · {icon.license}
            </dd>
          </>
        ) : null}
      </dl>
      {icon.trademark ? <p className={styles.trademark}>{icon.trademark}</p> : null}

      <table className={styles.tui}>
        <caption>In a terminal (hqtui icon())</caption>
        <tbody>
          <tr>
            <th>Nerd Font</th>
            <td className={styles.glyphNerd}>{t.nerd ?? "none"}</td>
            <td>{t.nerd_code ? <code>U+{t.nerd_code.toUpperCase()}</code> : null}</td>
            <td>{t.nerd ? <button type="button" className={styles.copy} data-copy={t.nerd}>Copy</button> : null}</td>
          </tr>
          <tr>
            <th>Unicode</th>
            <td className={styles.glyph}>{t.unicode}</td>
            <td>
              {t.unicode ? (
                <code>
                  {[...t.unicode].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(" ")}
                </code>
              ) : null}
            </td>
            <td>{t.unicode ? <button type="button" className={styles.copy} data-copy={t.unicode}>Copy</button> : null}</td>
          </tr>
          <tr>
            <th>ASCII</th>
            <td className={styles.glyph}>{t.ascii}</td>
            <td />
            <td>{t.ascii ? <button type="button" className={styles.copy} data-copy={t.ascii}>Copy</button> : null}</td>
          </tr>
        </tbody>
      </table>

      <div className={styles.actions}>
        {svgText ? (
          <button type="button" className={styles.copy} data-copy={svgText}>
            Copy SVG
          </button>
        ) : null}
        <button type="button" className={styles.copy} data-copy={img}>
          Copy &lt;img&gt;
        </button>
        <button type="button" className={styles.copy} data-copy={`icon("${icon.key}")`}>
          Copy icon(&quot;{icon.key}&quot;)
        </button>
      </div>
      <div className={styles.downloads}>
        <span>Download</span>
        <a href={`${OPENICON_RAW}/${icon.svg}`} download>
          SVG
        </a>
        {Object.entries(stylesOf(icon)).flatMap(([id, files]) =>
          files.png
            ? [256].map((s) => (
                <a key={`${id}${s}`} href={`${OPENICON_RAW}/${files.png!.replace("{size}", String(s))}`} download>
                  {set.style_info?.[id]?.label ?? id} PNG {s}
                </a>
              ))
            : []
        )}
        {icon.png
          ? [24, 64, 128, 256]
              .filter((s) => set.sizes.includes(s))
              .map((s) => (
                <a key={s} href={`${OPENICON_RAW}/${icon.png!.replace("{size}", String(s))}`} download>
                  PNG {s}
                </a>
              ))
          : null}
      </div>
      {icon.keywords?.length ? <p className={styles.keywords}>{icon.keywords.join(" · ")}</p> : null}
    </aside>
  );
}
