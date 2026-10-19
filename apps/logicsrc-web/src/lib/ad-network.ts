// ad.network publisher claim for logicsrc.com. The <meta name="ad.network">
// tag (home page metadata) lets ad.network verify ownership from the
// server-rendered HTML; the aside is the home page unit, filled in place by
// crawlproof.com/ad.js. Blog pages keep their own CrawlProof slot (AdUnit).
export const AD_NETWORK_CODE = "xPEOavNsIGrivkMw";
export const HOME_AD_SLOT = "efda46e1-bbc3-42e7-8fd0-2640bdd8a90f";

/** The home page unit, placed between the hero and the first band. */
export function renderHomeAdHtml(): string {
  return `<aside class="home-ad" data-ad-network="${AD_NETWORK_CODE}" data-cp-ad data-slot="${HOME_AD_SLOT}" data-format="banner_300x250"></aside>`;
}
