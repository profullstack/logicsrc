import type { ReactNode } from "react";
import Script from "next/script";

// CrawlProof ad unit, scoped to the pages that render it (currently /blog/*).
// The loader is deduped by src, so mounting <AdUnit /> on multiple routes only
// injects one https://crawlproof.com/ad.js.
export function AdUnit({
  slot,
  format = "banner_300x250",
}: {
  slot: string;
  format?: string;
}): ReactNode {
  return (
    <>
      <div data-cp-ad data-slot={slot} data-format={format} />
      <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
    </>
  );
}
