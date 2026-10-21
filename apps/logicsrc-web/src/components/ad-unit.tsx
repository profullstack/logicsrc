import type { ReactNode } from "react";
import Script from "next/script";

// CrawlProof ad unit, scoped to the pages that render it (currently /blog/*):
// the low-profile 40px text_link line, one per page, never on the home page.
// The loader is deduped by src, so mounting <AdUnit /> on multiple routes only
// injects one https://crawlproof.com/ad.js.
export function AdUnit({
  slot,
  format = "text_link",
}: {
  slot: string;
  format?: string;
}): ReactNode {
  return (
    <>
      <div data-cp-ad data-slot={slot} data-format={format} style={{ width: "100%", margin: "8px 0" }} />
      <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
    </>
  );
}
