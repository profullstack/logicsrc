import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Terms · LogicSRC",
  description:
    "Terms of engagement for LogicSRC: the specification and tooling are open source and free; Profullstack implementation work is billed at $400/hour against approved hours, with a 10-hour minimum.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage(): ReactNode {
  return (
    <SiteShell active="Terms">
      <article className="band" style={{ maxWidth: "48rem" }}>
        <div className="section-head">
          <h2>Terms</h2>
          <p>
            Two separate things live on this site: an open standard anyone may
            use, and paid implementation work from Profullstack, Inc. These terms
            cover both.
          </p>
        </div>

        <div className="blog-content" style={{ lineHeight: 1.7, marginTop: "1.5rem" }}>
          <h3>The standard is free</h3>
          <p>
            The LogicSRC specification, JSON schemas, SDKs, CLI, TUI, and
            reference plugins are open source under the project license. There is
            no license fee, no per-seat charge, and no obligation to hire us in
            order to implement the standard. Nothing on this page restricts your
            use of the spec.
          </p>

          <h3>Rate</h3>
          <p>
            Profullstack implementation work is billed at{" "}
            <strong>$400 per hour</strong>. One rate applies to all
            implementation work — specs, CLIs, SDKs, MCP resources, APIs, PWAs,
            and provider-neutral plugin surfaces. There are no tiers, role-based
            rates, or volume discounts.
          </p>

          <h3>What is billable</h3>
          <p>
            Billable hours are hours spent on your project: design, spec work,
            implementation, review, debugging, integration, and deployment, plus
            meetings and written communication about the work. Time is recorded
            in quarter-hour increments.
          </p>
          <p>
            The following are not billed: the initial scoping conversation,
            preparing your invoice, and time spent fixing defects in work we have
            already delivered and you have already paid for.
          </p>

          <h3>How you are invoiced</h3>
          <p>
            Billing is metered against actual hours worked, not a subscription.
            After we accept a project, we send you a record of hours worked. Once
            you approve those hours, we issue a CoinPay invoice for exactly that
            amount at $400/hour. You are never charged for hours you have not
            seen and approved.
          </p>
          <p>
            Invoices are payable on receipt via CoinPay, by card or by supported
            cryptocurrency. Work may pause on invoices unpaid after 14 days.
          </p>

          <h3>Minimum engagement</h3>
          <p>
            The minimum engagement is <strong>10 hours</strong>. Engagements
            smaller than this do not cover the cost of scoping and context, so we
            will decline them rather than quote them.
          </p>

          <h3>Cancellation</h3>
          <p>
            Either side may end an engagement at any time with one week&apos;s
            written notice. You pay for hours already worked and approved,
            including hours worked during the notice period; nothing further is
            owed. We do not bill a cancellation fee and we do not hold unused
            committed hours. Work product produced by hours you have paid for is
            yours to keep.
          </p>

          <h3>Existing engagements</h3>
          <p>
            Clients engaged under a prior pricing model keep their existing terms
            until both sides agree in writing to move to the hourly rate. This
            page does not reprice work already underway.
          </p>

          <h3>Estimates</h3>
          <p>
            Any estimate of total hours is an estimate, not a fixed-price quote.
            If the work looks likely to exceed an estimate we will tell you
            before the additional hours are worked, so you can rescope or stop.
          </p>

          <h3>Acceptable use</h3>
          <p>
            We build auditable, portable systems in the open. We decline work
            intended to deceive users, evade legal obligations, or produce
            systems that cannot be inspected by the people they affect.
          </p>

          <h3>Reference implementations</h3>
          <p>
            Reference implementations published under the LogicSRC project exist
            to prove the specification is usable. They are provided as-is,
            without warranty, and are not a hosted product or a support
            commitment. Paid engagements are governed by the terms above, not by
            the license of any reference implementation.
          </p>

          <h3>Questions</h3>
          <p>
            Submit a project through the <a href="/hire-us">Hire Us</a> form, or
            see <a href="/pricing">Pricing</a> for a summary. These terms may
            change; the version on this page at the time your engagement starts
            is the one that applies to it.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
