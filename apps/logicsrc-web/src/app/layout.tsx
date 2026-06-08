import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";
import Script from "next/script";

const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");
const DESCRIPTION =
  "Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LogicSRC — Open Coordination Standards for Humans & AI Agents",
  description: DESCRIPTION,
  applicationName: "LogicSRC",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "LogicSRC",
    url: SITE_URL,
    title: "LogicSRC — Open Coordination Standards for Humans & AI Agents",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "LogicSRC — Open Coordination Standards",
    description: DESCRIPTION,
  },
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
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Script
          data-site="56a0c760-e6cb-4875-844e-8b8aaa80b59b"
          src="https://crawlproof.com/stats.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
