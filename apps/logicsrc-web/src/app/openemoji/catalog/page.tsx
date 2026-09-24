import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { contentMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { Catalog } from "./catalog";
import { REPO_URL } from "./set";
import styles from "./catalog.module.css";

export const metadata: Metadata = contentMetadata({
  title: "OpenEmoji Catalog: Every Glyph in the Set",
  description:
    "Every standard emoji in the OpenEmoji set, 3,963 in Emoji 18.0, drawn by gpt-image-2 as one family. Search by name or CLDR keyword, filter by group, skin tone, Emoji version and status, copy the character or download PNG and SVG.",
  path: "/openemoji/catalog"
});

export default function OpenEmojiCatalogPage(): ReactNode {
  return (
    <SiteShell active="OpenEmoji">
      <div className="band">
        <div className={styles.intro}>
          <p className="eyebrow">
            <Link href="/openemoji">OpenEmoji</Link> reference set
          </p>
          <h2>The catalog</h2>
          <p>
            Every emoji Unicode lists, drawn as one set. Search by name or by the words people use
            (&ldquo;lol&rdquo; finds 😂), narrow by group, skin tone or Emoji version, and open one for
            its codepoints, its tone family and the files. Anything not drawn yet shows your
            system&apos;s emoji in its place. The set, its fonts and every size are in{" "}
            <a href={REPO_URL}>profullstack/openemoji</a>.
          </p>
        </div>
        <Catalog />
      </div>
    </SiteShell>
  );
}
