// The Profullstack footer (links, copyright, the << Profullstack >> webring row and
// the square built.indie + PwaMart badges) from @profullstack/footer, on the public
// sign-in page. It is rendered into the HTML on the server because rssamplifier's
// ring verifier reads the page and never runs script.
//
// This origin holds vault identity keys in browser storage, so the footer uses
// the package's bundled template only: nothing is fetched at runtime. A footer
// release reaches this app through the shared latest dependency and normal deploy.
import { footerHtmlSync } from "@profullstack/footer";

const SITE = "https://app.logicsrc.com/";
export const RING_FOOTER_OPTIONS = {
  site: SITE,
  builtIndieHref: `https://built.indie.pit.world/for?site=${SITE}`,
  pwamartHref: `https://pwamart.com/for?site=${SITE}`,
};

const html = footerHtmlSync(RING_FOOTER_OPTIONS);

/** The footer markup; never empty. */
export const ringFooter = () => html;
