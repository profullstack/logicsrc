import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "LogicSRC",
  description:
    "Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products.",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#101418",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}        <Script data-site="56a0c760-e6cb-4875-844e-8b8aaa80b59b" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
