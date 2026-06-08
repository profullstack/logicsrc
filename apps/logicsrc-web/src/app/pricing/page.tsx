import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Pricing · LogicSRC",
  description:
    "LogicSRC the open specification, schemas, SDKs, and CLI are free and open source. Implementation help is $250/week for accepted work, paid via CoinPay.",
  alternates: { canonical: "/pricing" },
};

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is LogicSRC free?",
    a: "Yes. The LogicSRC specification, JSON schemas, SDKs, CLI, TUI, and reference plugins are open source and free to use under the project license. There is no license fee to implement the standard.",
  },
  {
    q: "How does pricing work?",
    a: "The standard is free. If you want Profullstack to build a LogicSRC-based system for you, implementation work is billed at $250/week for accepted work, paid via a CoinPay recurring invoice.",
  },
  {
    q: "Who is LogicSRC for?",
    a: "Engineering and AI-platform teams building systems where humans and AI agents coordinate — boards, tasks, agent runs, identity, payments, and audit — without locking into a single vendor's proprietary platform.",
  },
  {
    q: "How do I pay or get started?",
    a: "Read the docs and adopt the schemas for free, or submit a project through the Hire Us form. Accepted projects are invoiced weekly via CoinPay.",
  },
];

export default function PricingPage(): ReactNode {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <SiteShell active="Pricing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="band" style={{ maxWidth: "48rem" }}>
        <div className="section-head">
          <h2>Pricing</h2>
          <p>
            The LogicSRC specification and tooling are open source and free. You
            only pay if you want us to build it for you.
          </p>
        </div>

        <div className="blog-content" style={{ lineHeight: 1.7, marginTop: "1rem" }}>
          <ul>
            <li>
              <strong>Standard &amp; tooling — $0.</strong> Spec, schemas, SDKs,
              CLI, TUI, and reference plugins are open source.
            </li>
            <li>
              <strong>Implementation — $250/week.</strong> Profullstack builds
              LogicSRC-based systems for accepted projects, billed weekly via
              CoinPay. See <a href="/hire-us">Hire Us</a>.
            </li>
          </ul>

          <h3>Frequently asked questions</h3>
          {FAQ.map((item) => (
            <div key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </article>
    </SiteShell>
  );
}
