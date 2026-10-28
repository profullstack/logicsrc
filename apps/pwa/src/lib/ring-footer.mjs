// The Profullstack footer (links, copyright, the << Profullstack >> webring row and
// the built.indie + pwamart badges) from @profullstack/footer, on the public
// sign-in page. It is rendered into the HTML on the server because rssamplifier's
// ring verifier reads the page and never runs script.
//
// This origin holds vault identity keys in browser storage, so the footer is the
// template BUNDLED in the pinned package version only. It used to be refreshed
// from jsdelivr @latest every 15 minutes, which made whoever could publish the
// footer package able to put HTML on this origin, past a bypassable sanitizer.
// A footer change now reaches this app by bumping the pinned dependency.
import { footerHtmlSync } from "@profullstack/footer";

export const RING_FOOTER_OPTIONS = { site: "https://app.logicsrc.com/" };

const html = footerHtmlSync(RING_FOOTER_OPTIONS);

/** The footer markup; never empty. */
export const ringFooter = () => html;
