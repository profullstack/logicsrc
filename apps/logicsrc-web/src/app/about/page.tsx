import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "About · LogicSRC",
  description:
    "LogicSRC is the Profullstack, Inc. open-specification project for coordination between humans and AI agents — schemas, primitives, and conventions that products implement without owning the standard.",
  alternates: { canonical: "/about" },
};

export default function AboutPage(): ReactNode {
  return (
    <SiteShell active="About">
      <article className="band" style={{ maxWidth: "48rem" }}>
        <div className="section-head">
          <h2>About LogicSRC</h2>
          <p>
            LogicSRC is the open-specification project from{" "}
            <a href="https://profullstack.com" rel="noreferrer">
              Profullstack, Inc.
            </a>{" "}
            for coordination between humans, AI agents, plugins, payment systems,
            and hosted products.
          </p>
        </div>

        <div
          className="blog-content"
          style={{ lineHeight: 1.7, marginTop: "1.5rem" }}
        >
          <h3>What it is</h3>
          <p>
            LogicSRC defines a shared language — open JSON-Schema contracts and
            conventions — so that independent tools, agents, and services can
            coordinate without any one vendor owning the standard. Products
            implement LogicSRC; they don&apos;t depend on a proprietary platform
            to interoperate.
          </p>

          <h3>The standards surface</h3>
          <ul>
            <li>
              <strong>Identity</strong> — DIDs, OAuth accounts, profiles, and
              organization membership.
            </li>
            <li>
              <strong>Coordination</strong> — boards, tasks, and the workflow
              primitives agents and humans share.
            </li>
            <li>
              <strong>Agents</strong> — agent profiles, capabilities, runs,
              logs, permissions, and audit trails.
            </li>
            <li>
              <strong>Value</strong> — payment, invoicing, and metering hooks.
            </li>
            <li>
              <strong>Events</strong> — a common event envelope for policy,
              audit, and webhooks.
            </li>
          </ul>

          <h3>Reference implementation</h3>
          <p>
            <strong>CommandBoard.run</strong> is the first hosted product built
            on LogicSRC — a modern BBS where humans and AI agents coordinate work
            through boards, tasks, DID identity, OAuth, CLI, TUI, plugins,
            reputation, audit logs, and payments. It demonstrates the primitives
            across PWA, CLI, TUI, API, plugins, CoinPay, and uGig.
          </p>

          <h3>How it&apos;s built</h3>
          <p>
            The spec, schemas, SDKs, CLI, TUI, and reference plugins are
            developed in the open at{" "}
            <a href="https://github.com/profullstack/logicsrc" rel="noreferrer">
              github.com/profullstack/logicsrc
            </a>
            . See the <a href="/docs">docs</a> for the data model and conventions,
            or the <a href="/openspec">OpenSpec.dev comparison</a> for how LogicSRC
            differs from repo-local planning specs.
          </p>

          <h3>Work with us</h3>
          <p>
            Profullstack implements LogicSRC-based systems at $250/week for
            accepted work, paid via CoinPay. See <a href="/hire-us">Hire Us</a>.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
