"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./catalog.module.css";
import { REPO_RAW, SET_URL } from "./set";

/**
 * The whole OpenEmoji set, filterable.
 *
 * Reads the set's own openemoji.json, which lists every emoji Unicode has,
 * drawn or not (an entry without files is listed, not drawn), so this page is
 * complete from the first glyph and fills in as the rest are drawn.
 *
 * Filters live in the query string, so a filtered view is a link.
 */


type Emoji = {
  key: string;
  char: string;
  name: string;
  group: string;
  subgroup: string;
  unicode: string;
  keywords?: string[];
  shortcodes?: string[];
  base?: string;
  png?: string;
  svg?: string;
  webp?: string;
};

type NetworkPack = { id: string; title: string; subset: string; keys: string[]; file: string; bytes: number };

type Network = {
  id: string;
  name: string;
  kind: "emoji" | "stickers" | "media";
  size: number;
  format: string;
  max_bytes: number;
  name_rule?: { max: number; pattern: string; prefix: string };
  packSize?: number;
  packsFrom?: string;
  highlight?: { subgroups: string[]; why: string };
  limits: string;
  steps: string[];
  docs: string[];
  packs: NetworkPack[];
  renamed: Record<string, string>;
};

type Networks = { generated: string; download_base: string; platforms: Network[] };

const KIND_LABEL: Record<Network["kind"], string> = {
  emoji: "Custom emoji",
  stickers: "Sticker packs",
  media: "Images to post"
};

type Manifest = {
  name: string;
  version: string;
  unicode: string;
  license: string;
  ai_model?: string;
  sizes: number[];
  webp_sizes?: number[];
  coverage: { total: number; drawn: number };
  emoji: Emoji[];
};

/** Key, swatch colour, label. Colour dots, not 🏻: a box with no emoji font is no swatch at all. */
const TONES: Array<[string, string, string]> = [
  ["1f3fb", "#f7d7c4", "light"],
  ["1f3fc", "#dfb896", "medium-light"],
  ["1f3fd", "#bb8e67", "medium"],
  ["1f3fe", "#8d5e3f", "medium-dark"],
  ["1f3ff", "#5b3a2c", "dark"]
];
const TONE_KEYS = new Set(TONES.map(([key]) => key));
const tonesOf = (e: Emoji): string[] => e.key.split("-").filter((cp) => TONE_KEYS.has(cp));

type Filters = {
  q: string;
  group: string;
  sub: string;
  /** "" = default (no tone), a tone key, or "all" for every variant. */
  tone: string;
  version: string;
  status: "" | "drawn" | "todo";
  sort: "unicode" | "name" | "newest";
  size: number;
  /** A network id from platforms.json, and optionally one of its packs. */
  platform: string;
  pack: string;
};

const DEFAULTS: Filters = {
  q: "",
  group: "",
  sub: "",
  tone: "",
  version: "",
  status: "",
  sort: "unicode",
  size: 56,
  platform: "",
  pack: ""
};
const PAGE = 360;

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const size = Number(params.get("size"));
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    group: params.get("group") ?? "",
    sub: params.get("sub") ?? "",
    tone: params.get("tone") ?? "",
    version: params.get("v") ?? "",
    status: status === "drawn" || status === "todo" ? status : "",
    sort: sort === "name" || sort === "newest" ? sort : "unicode",
    size: size >= 32 && size <= 128 ? size : DEFAULTS.size,
    platform: params.get("platform") ?? "",
    pack: params.get("pack") ?? ""
  };
}

function writeFilters(f: Filters, selected: string | null): void {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.group) params.set("group", f.group);
  if (f.sub) params.set("sub", f.sub);
  if (f.tone) params.set("tone", f.tone);
  if (f.version) params.set("v", f.version);
  if (f.status) params.set("status", f.status);
  if (f.sort !== "unicode") params.set("sort", f.sort);
  if (f.size !== DEFAULTS.size) params.set("size", String(f.size));
  if (f.platform) params.set("platform", f.platform);
  if (f.pack) params.set("pack", f.pack);
  if (selected) params.set("e", selected);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

const compareVersions = (a: string, b: string): number => {
  const [a1 = 0, a2 = 0] = a.split(".").map(Number);
  const [b1 = 0, b2 = 0] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
};

const codepoints = (key: string): string =>
  key
    .split("-")
    .map((cp) => `U+${cp.toUpperCase()}`)
    .join(" ");

/** Lowercased haystack per entry, built once. */
const haystackOf = (e: Emoji): string =>
  [e.name, e.char, e.key, codepoints(e.key), e.group, e.subgroup, ...(e.keywords ?? [])].join(" ").toLowerCase();

const fill = (template: string, size: number): string => template.replace("{size}", String(size));

export function Catalog(): ReactNode {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [networks, setNetworks] = useState<Networks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initial = readFilters();
    setFilters(initial);
    setQuery(initial.q);
    setSelected(new URLSearchParams(window.location.search).get("e"));
    setReady(true);
    fetch(`${SET_URL}/openemoji.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Manifest>;
      })
      .then(setManifest)
      .catch((reason: Error) => setError(reason.message));
    // The per-network bundles are optional: without them the catalog still works.
    fetch(`${SET_URL}/platforms.json`)
      .then((response) => (response.ok ? (response.json() as Promise<Networks>) : null))
      .then(setNetworks)
      .catch(() => setNetworks(null));
  }, []);

  // The search box types freely; the filter follows a beat behind.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 140);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (ready) writeFilters(filters, selected);
  }, [filters, selected, ready]);

  useEffect(() => setShown(PAGE), [filters]);

  const index = useMemo(() => {
    if (!manifest) return null;
    const byKey = new Map(manifest.emoji.map((e) => [e.key, e]));
    const variants = new Map<string, Emoji[]>();
    for (const e of manifest.emoji) if (e.base) variants.set(e.base, [...(variants.get(e.base) ?? []), e]);
    const hay = new Map(manifest.emoji.map((e) => [e.key, haystackOf(e)]));
    const order = new Map(manifest.emoji.map((e, i) => [e.key, i]));
    const groups = [...new Set(manifest.emoji.map((e) => e.group))];
    const versions = [...new Set(manifest.emoji.map((e) => e.unicode))].sort(compareVersions).reverse();
    return { byKey, variants, hay, order, groups, versions };
  }, [manifest]);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "group") next.sub = "";
      if (key === "platform") next.pack = "";
      return next;
    });
  }, []);

  /** Everything but the tone view: what the group and status counts are taken over. */
  const matchesBase = useCallback(
    (e: Emoji, f: Filters, skip: Partial<Record<"group" | "status", boolean>> = {}): boolean => {
      if (!index) return false;
      if (!skip.group && f.group && e.group !== f.group) return false;
      if (f.sub && e.subgroup !== f.sub) return false;
      if (f.version && e.unicode !== f.version) return false;
      if (!skip.status && f.status === "drawn" && !e.png) return false;
      if (!skip.status && f.status === "todo" && e.png) return false;
      if (f.q) {
        const hay = index.hay.get(e.key) ?? "";
        for (const word of f.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!hay.includes(word)) return false;
      }
      return true;
    },
    [index]
  );

  /**
   * The tone view, the way a keyboard does it: default shows the untoned
   * glyphs; a tone shows each glyph in that tone where it has one (and as it
   * is where it has none); "all" shows every variant.
   */
  const toneView = useCallback(
    (list: Emoji[], tone: string): Emoji[] => {
      if (!index || tone === "all") return list;
      if (!tone) return list.filter((e) => tonesOf(e).length === 0);
      const out: Emoji[] = [];
      for (const e of list) {
        const tones = tonesOf(e);
        if (tones.length > 0) continue;
        const swap = (index.variants.get(e.key) ?? []).find((v) => {
          const t = tonesOf(v);
          return t.length > 0 && t.every((x) => x === tone);
        });
        out.push(swap ?? e);
      }
      return out;
    },
    [index]
  );

  const network = useMemo(
    () => networks?.platforms.find((p) => p.id === filters.platform) ?? null,
    [networks, filters.platform]
  );

  /** What the chosen network's bundles hold (or one pack of them); null when no network is chosen. */
  const networkKeys = useMemo(() => {
    if (!network) return null;
    const packs = filters.pack ? network.packs.filter((p) => p.id === filters.pack) : network.packs;
    return new Set(packs.flatMap((p) => p.keys));
  }, [network, filters.pack]);

  /** The name an emoji goes by on the chosen network. */
  const nameOn = useCallback(
    (e: Emoji): string | null => {
      if (!network?.name_rule) return null;
      return network.renamed[e.key] ?? e.shortcodes?.[0] ?? null;
    },
    [network]
  );

  const results = useMemo(() => {
    if (!manifest || !index) return [];
    // Tone swaps come from variants the other filters may have excluded
    // (a search for "thumbs" still wants 👍🏽), so filter the toneless view
    // first and swap after, then re-check the status filter on the swap.
    const base = manifest.emoji.filter((e) => matchesBase(e, { ...filters, status: "" }));
    let list = toneView(base, filters.tone);
    if (filters.status === "drawn") list = list.filter((e) => e.png);
    if (filters.status === "todo") list = list.filter((e) => !e.png);
    if (networkKeys) {
      // A network's bundles decide; with a tone chosen, a variant outside
      // them falls back to its base when the base is in.
      list = list
        .map((e) => (networkKeys.has(e.key) ? e : e.base && networkKeys.has(e.base) ? index.byKey.get(e.base)! : null))
        .filter((e): e is Emoji => Boolean(e));
      list = [...new Map(list.map((e) => [e.key, e])).values()];
    }
    if (filters.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (filters.sort === "newest")
      list = [...list].sort(
        (a, b) => compareVersions(b.unicode, a.unicode) || (index.order.get(a.key) ?? 0) - (index.order.get(b.key) ?? 0)
      );
    return list;
  }, [manifest, index, filters, matchesBase, toneView, networkKeys]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!manifest) return counts;
    const list = toneView(
      manifest.emoji.filter((e) => matchesBase(e, filters, { group: true })),
      filters.tone
    );
    for (const e of list) {
      if (networkKeys && !networkKeys.has(e.key)) continue;
      counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
    }
    return counts;
  }, [manifest, filters, matchesBase, toneView, networkKeys]);

  const subgroups = useMemo(() => {
    if (!manifest || !filters.group) return [];
    return [...new Set(manifest.emoji.filter((e) => e.group === filters.group).map((e) => e.subgroup))];
  }, [manifest, filters.group]);

  // Render in pages as the reader scrolls: 4,000 tiles at once is a slow first paint.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((n) => n + PAGE);
      },
      { rootMargin: "800px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [results.length]);

  const current = selected && index ? (index.byKey.get(selected) ?? null) : null;

  // Arrow keys walk the results while the detail panel is open; Escape closes it.
  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelected(null);
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const at = results.findIndex((e) => e.key === current.key);
      if (at === -1) return;
      const next = results[at + (event.key === "ArrowRight" ? 1 : -1)];
      if (next) {
        event.preventDefault();
        setSelected(next.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, results]);

  if (error) {
    return <p className={styles.notice}>The set could not be loaded ({error}).</p>;
  }
  if (!manifest || !index) {
    return <p className={styles.notice}>Loading the set…</p>;
  }

  const drawnPct = Math.round((manifest.coverage.drawn / manifest.coverage.total) * 100);
  const active =
    filters.q || filters.group || filters.sub || filters.tone || filters.version || filters.status || filters.sort !== "unicode";

  return (
    <div className={styles.catalog} style={{ ["--tile" as string]: `${filters.size}px` }}>
      <div className={styles.progress} aria-label={`${manifest.coverage.drawn} of ${manifest.coverage.total} drawn`}>
        <div className={styles.progressBar} style={{ width: `${drawnPct}%` }} />
        <span>
          {manifest.coverage.drawn.toLocaleString()} of {manifest.coverage.total.toLocaleString()} drawn · Unicode{" "}
          {manifest.unicode} · {manifest.license} · set {manifest.version}
        </span>
      </div>

      {networks ? (
        <div className={styles.networks} role="group" aria-label="Network">
          <div className={styles.networkRow}>
            <span className={styles.rowLabel}>Install on</span>
            <button
              type="button"
              className={!filters.platform ? styles.chipOn : styles.chip}
              onClick={() => set("platform", "")}
            >
              Any network
            </button>
          </div>
          {(["emoji", "stickers", "media"] as const).map((kind) => (
            <div key={kind} className={styles.networkRow}>
              <span className={styles[`kind_${kind}`]}>{KIND_LABEL[kind]}</span>
              {networks.platforms
                .filter((p) => p.kind === kind)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={filters.platform === p.id ? styles.chipOn : styles.chip}
                    onClick={() => {
                      if (filters.platform === p.id) {
                        set("platform", "");
                        return;
                      }
                      // A network that names what it is for (X: flags) opens on it.
                      const sub = p.highlight?.subgroups[0] ?? "";
                      const group = sub ? (manifest.emoji.find((e) => e.subgroup === sub)?.group ?? "") : "";
                      setFilters((f) => ({ ...f, platform: p.id, pack: "", group: sub ? group : f.group, sub: sub || f.sub }));
                    }}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}

      {network && networks ? (
        <NetworkPanel
          network={network}
          repoRaw={networks.download_base}
          activePack={filters.pack}
          onPack={(id) => set("pack", filters.pack === id ? "" : id)}
          onHighlight={(sub) => {
            const e = manifest.emoji.find((x) => x.subgroup === sub);
            setFilters((f) => ({ ...f, group: e?.group ?? "", sub }));
          }}
        />
      ) : null}

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search 3,963 emoji: name, keyword, lol, U+1F600…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search emoji"
        />
        <div className={styles.controls}>
          <label>
            <span>Subgroup</span>
            <select value={filters.sub} onChange={(e) => set("sub", e.target.value)} disabled={!filters.group}>
              <option value="">{filters.group ? "All subgroups" : "Pick a group"}</option>
              {subgroups.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/-/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Emoji version</span>
            <select value={filters.version} onChange={(e) => set("version", e.target.value)}>
              <option value="">Any</option>
              {index.versions.map((v) => (
                <option key={v} value={v}>
                  New in {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])}>
              <option value="">Drawn and not yet</option>
              <option value="drawn">Drawn</option>
              <option value="todo">Not drawn yet</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={filters.sort} onChange={(e) => set("sort", e.target.value as Filters["sort"])}>
              <option value="unicode">Unicode order</option>
              <option value="name">Name A–Z</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
          <label className={styles.sizeControl}>
            <span>Size {filters.size}px</span>
            <input
              type="range"
              min={32}
              max={128}
              step={8}
              value={filters.size}
              onChange={(e) => set("size", Number(e.target.value))}
            />
          </label>
        </div>

        <div className={styles.row} role="group" aria-label="Group">
          <button
            type="button"
            className={!filters.group ? styles.chipOn : styles.chip}
            onClick={() => set("group", "")}
          >
            All groups
          </button>
          {index.groups.map((g) => (
            <button
              type="button"
              key={g}
              className={filters.group === g ? styles.chipOn : styles.chip}
              onClick={() => set("group", filters.group === g ? "" : g)}
            >
              {g} <small>{(groupCounts.get(g) ?? 0).toLocaleString()}</small>
            </button>
          ))}
        </div>

        <div className={styles.row} role="group" aria-label="Skin tone">
          <span className={styles.rowLabel}>Skin tone</span>
          <button type="button" className={!filters.tone ? styles.chipOn : styles.chip} onClick={() => set("tone", "")}>
            Default
          </button>
          {TONES.map(([key, swatch, label]) => (
            <button
              type="button"
              key={key}
              title={`${label} skin tone`}
              aria-label={`${label} skin tone`}
              className={filters.tone === key ? styles.chipOn : styles.chip}
              onClick={() => set("tone", filters.tone === key ? "" : key)}
            >
              <span className={styles.swatch} style={{ background: swatch }} />
            </button>
          ))}
          <button
            type="button"
            className={filters.tone === "all" ? styles.chipOn : styles.chip}
            onClick={() => set("tone", filters.tone === "all" ? "" : "all")}
          >
            Every variant
          </button>
          <span className={styles.count}>
            {results.length.toLocaleString()} {results.length === 1 ? "emoji" : "emoji"}
            {active ? (
              <button
                type="button"
                className={styles.reset}
                onClick={() => {
                  setQuery("");
                  setFilters({ ...DEFAULTS, size: filters.size });
                }}
              >
                Reset
              </button>
            ) : null}
          </span>
        </div>
      </div>

      {results.length === 0 ? (
        <p className={styles.notice}>Nothing matches. Try fewer words, or reset the filters.</p>
      ) : (
        <ul className={styles.grid}>
          {results.slice(0, shown).map((e) => (
            <li key={e.key}>
              <button
                type="button"
                className={`${styles.tile} ${e.png ? "" : styles.todo} ${selected === e.key ? styles.tileOn : ""}`}
                onClick={() => setSelected(e.key)}
                title={e.png ? e.name : `${e.name} (not drawn yet)`}
              >
                {e.webp ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${SET_URL}/${fill(e.webp, 128)}`}
                    alt={e.char}
                    width={filters.size}
                    height={filters.size}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className={styles.fallback} aria-label={e.name}>
                    {e.char}
                  </span>
                )}
                {filters.size >= 48 ? (
                  <span className={styles.label}>{nameOn(e) ? `:${nameOn(e)}:` : e.name}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown < results.length ? <div ref={sentinel} className={styles.sentinel} /> : null}

      {current ? (
        <Detail
          emoji={current}
          network={network}
          nameOnNetwork={nameOn(current)}
          variants={index.variants.get(current.base ?? current.key) ?? []}
          base={current.base ? (index.byKey.get(current.base) ?? null) : null}
          onSelect={setSelected}
          onKeyword={(word) => {
            setQuery(word);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function NetworkPanel({
  network,
  repoRaw,
  activePack,
  onPack,
  onHighlight
}: {
  network: Network;
  repoRaw: string;
  activePack: string;
  onPack: (id: string) => void;
  onHighlight: (subgroup: string) => void;
}): ReactNode {
  const mb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  return (
    <section className={styles.panel} aria-label={`Install on ${network.name}`}>
      <div className={styles.panelHead}>
        <h3>
          {network.name} <span className={styles[`kind_${network.kind}`]}>{KIND_LABEL[network.kind]}</span>
        </h3>
        <p>{network.limits}</p>
        {network.highlight ? (
          <p className={styles.highlight}>
            {network.highlight.why}{" "}
            {network.highlight.subgroups.map((sub) => (
              <button type="button" key={sub} className={styles.linkish} onClick={() => onHighlight(sub)}>
                {sub.replace(/-/g, " ")}
              </button>
            ))}
          </p>
        ) : null}
      </div>
      <div className={styles.panelBody}>
        <ol className={styles.steps}>
          {network.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {network.packs.length ? (
          <div className={styles.packs}>
            <table>
              <thead>
                <tr>
                  <th>Pack</th>
                  <th>{network.kind === "stickers" ? "Stickers" : "Emoji"}</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {network.packs.map((pack) => (
                  <tr key={pack.id} className={activePack === pack.id ? styles.packOn : undefined}>
                    <td>{pack.title}</td>
                    <td>{pack.keys.length.toLocaleString()}</td>
                    <td>{mb(pack.bytes)}</td>
                    <td className={styles.packActions}>
                      <button type="button" className={styles.linkish} onClick={() => onPack(pack.id)}>
                        {activePack === pack.id ? "Show all" : "Show"}
                      </button>
                      <a href={`${repoRaw}/${pack.file}`} download>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {network.docs.length ? (
          <p className={styles.docs}>
            Official docs:{" "}
            {network.docs.map((url, i) => (
              <span key={url}>
                {i ? ", " : ""}
                <a href={url} rel="noopener noreferrer" target="_blank">
                  {new URL(url).hostname.replace(/^www\./, "")}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Detail({
  emoji,
  network,
  nameOnNetwork,
  variants,
  base,
  onSelect,
  onKeyword,
  onClose
}: {
  emoji: Emoji;
  network: Network | null;
  nameOnNetwork: string | null;
  variants: Emoji[];
  base: Emoji | null;
  onSelect: (key: string) => void;
  onKeyword: (word: string) => void;
  onClose: () => void;
}): ReactNode {
  const family = base ? [base, ...variants] : variants.length ? [emoji, ...variants] : [];
  const imgTag = `<img class="openemoji" src="${REPO_RAW}/png/64/${emoji.key}.png" alt="${emoji.char}" title="${emoji.name}">`;
  return (
    <aside className={styles.detail} aria-label={`${emoji.name} details`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className={styles.hero}>
        {emoji.png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${SET_URL}/${fill(emoji.webp ?? emoji.png, 128)}`} alt={emoji.char} width={128} height={128} />
        ) : (
          <span className={styles.heroFallback}>{emoji.char}</span>
        )}
        <span className={styles.native} title="How your system draws it">
          {emoji.char}
        </span>
      </div>
      <h3>{emoji.name}</h3>
      {!emoji.png ? <p className={styles.todoNote}>Not drawn yet. The system emoji stands in until it is.</p> : null}
      <dl className={styles.facts}>
        <dt>Key</dt>
        <dd>
          <code>{emoji.key}</code>
        </dd>
        <dt>Codepoints</dt>
        <dd>
          <code>{codepoints(emoji.key)}</code>
        </dd>
        <dt>Group</dt>
        <dd>
          {emoji.group} › {emoji.subgroup.replace(/-/g, " ")}
        </dd>
        <dt>Emoji version</dt>
        <dd>{emoji.unicode}</dd>
      </dl>

      {family.length > 1 ? (
        <div className={styles.family}>
          {family.map((v) => (
            <button
              type="button"
              key={v.key}
              className={v.key === emoji.key ? styles.familyOn : styles.familyItem}
              onClick={() => onSelect(v.key)}
              title={v.name}
            >
              {v.webp ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${SET_URL}/${fill(v.webp, 64)}`} alt={v.char} width={32} height={32} />
              ) : (
                v.char
              )}
            </button>
          ))}
        </div>
      ) : null}

      {network ? (
        <p className={styles.onNetwork}>
          On {network.name}:{" "}
          {nameOnNetwork ? <code>:{nameOnNetwork}:</code> : KIND_LABEL[network.kind].toLowerCase()}
          {(() => {
            const packs = network.packs.filter((p) => p.keys.includes(emoji.key)).map((p) => p.title);
            return packs.length ? <span> · in {packs.join(", ")}</span> : <span> · not in a bundle for this network</span>;
          })()}
        </p>
      ) : emoji.shortcodes?.[0] ? (
        <p className={styles.onNetwork}>
          Shortcode <code>:{emoji.shortcodes[0]}:</code>
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.copy} data-copy={emoji.char}>
          Copy emoji
        </button>
        <button type="button" className={styles.copy} data-copy={emoji.key}>
          Copy key
        </button>
        {emoji.png ? (
          <button type="button" className={styles.copy} data-copy={imgTag}>
            Copy &lt;img&gt;
          </button>
        ) : null}
      </div>

      {emoji.png ? (
        <div className={styles.downloads}>
          <span>Download</span>
          {[512, 256, 128, 64].map((size) => (
            <a key={size} href={`${REPO_RAW}/${fill(emoji.png!, size)}`} download>
              PNG {size}
            </a>
          ))}
          {emoji.svg ? (
            <a href={`${REPO_RAW}/${emoji.svg}`} download>
              SVG
            </a>
          ) : null}
        </div>
      ) : null}

      {emoji.keywords?.length ? (
        <div className={styles.keywords}>
          {emoji.keywords.map((word) => (
            <button type="button" key={word} onClick={() => onKeyword(word)}>
              {word}
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
