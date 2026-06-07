import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";

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
      <body>{children}</body>
    </html>
  );
}
