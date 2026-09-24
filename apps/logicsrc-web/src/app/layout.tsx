import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";
import Script from "next/script";
import { FeedbackWidget } from "@profullstack/stack/feedback";
import { CopyButtons } from "@/components/copy-buttons";
import { PAGE_META, pageMetadata, SITE_URL } from "@/lib/page-meta";

const DESCRIPTION = PAGE_META["/"].description;

// The layout's metadata is the homepage's, and every child page overrides it
// through specMetadata/pageMetadata/contentMetadata. That matters most for
// openGraph: Next.js shallow-merges metadata, so a page that omits `openGraph`
// inherits this object whole -- which is how every spec came to share the
// homepage's og:title on Reddit. See lib/page-meta.ts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "LogicSRC",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  ...pageMetadata("/"),
};

export const viewport: Viewport = {
  themeColor: "#101418",
  width: "device-width",
  initialScale: 1,
};

// Organization + WebSite JSON-LD so answer engines can resolve LogicSRC as a
// distinct entity without guessing.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "LogicSRC",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      description: DESCRIPTION,
      parentOrganization: {
        "@type": "Organization",
        name: "Profullstack, Inc.",
        url: "https://profullstack.com",
      },
      sameAs: [
        "https://github.com/profullstack/logicsrc",
        "https://profullstack.com",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "LogicSRC",
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <head>
        {/* OpenProfile.md discovery (/openprofile, rule "A link element"): the
            site points at its own profile, the one relays name as operator. */}
        <link rel="openprofile" href={`${SITE_URL}/.well-known/openprofile.md`} />
        {/* OpenStack.md discovery (/openstack, rule 9): what this site is built on. */}
        <link rel="openstack" href={`${SITE_URL}/.well-known/openstack.md`} />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        {/* one delegated handler for every [data-copy] button, site-wide */}
        <CopyButtons />
        <Script
          data-site="56a0c760-e6cb-4875-844e-8b8aaa80b59b"
          src="https://crawlproof.com/stats.js"
          strategy="afterInteractive"
        />
        <FeedbackWidget property="logicsrc.com" />
      </body>
    </html>
  );
}
