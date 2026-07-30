import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Privacy · LogicSRC",
  description:
    "What logicsrc.com collects and what it does not: privacy-friendly analytics, the Hire Us project form, the CoinPay sign-in cookie, and the boundary that keeps credential values off our servers.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage(): ReactNode {
  return (
    <SiteShell active="Privacy">
      <article className="band" style={{ maxWidth: "48rem" }}>
        <div className="section-head">
          <h2>Privacy</h2>
          <p>
            This page describes what logicsrc.com does with data. It covers the
            marketing site and the credentials app; it does not restrict how you
            use the specification, schemas, or CLI, which run on your own
            machines and report nothing back to us.
          </p>
        </div>

        <div className="blog-content" style={{ lineHeight: 1.7, marginTop: "1.5rem" }}>
          <h3>Who is responsible</h3>
          <p>
            Profullstack, Inc. operates logicsrc.com and is responsible for the
            data described here. For any privacy question, or to ask us to
            delete something you sent us, email{" "}
            <a href="mailto:privacy@profullstack.com">privacy@profullstack.com</a>
            . Security reports go to{" "}
            <a href="mailto:security@profullstack.com">security@profullstack.com</a>{" "}
            (see <a href="/.well-known/security.txt">security.txt</a>).
          </p>

          <h3>There is no account required to read this site</h3>
          <p>
            Browsing the specification, docs, blog, and schema pages requires no
            account, no sign-in, and no cookie. We do not run advertising
            trackers, we do not sell or share data with data brokers, and we do
            not build advertising profiles.
          </p>

          <h3>Analytics</h3>
          <p>
            Page views are measured with{" "}
            <a href="https://crawlproof.com" rel="noreferrer">CrawlProof</a>, a
            privacy-friendly analytics service that records aggregate page
            traffic — pages visited, referrer, rough geography, and device
            class. It does not set advertising cookies and does not follow you
            across other sites. We use it to see which specs and docs people
            actually read.
          </p>

          <h3>The Hire Us form</h3>
          <p>
            If you submit a project through <a href="/hire-us">Hire Us</a>, you
            send us two things: the contact address you type, and your
            description of the work. We use them only to evaluate and reply to
            your request, and to scope an engagement if it is a fit. We do not
            add the address to a marketing list. Ask us to delete a request and
            we will.
          </p>

          <h3>Payments and the CoinPay sign-in</h3>
          <p>
            Paid work is invoiced through CoinPay. If you
            connect a CoinPay account, we complete an OAuth sign-in and store
            the resulting session in a signed, <code>HttpOnly</code>,{" "}
            <code>SameSite=Lax</code> cookie so the site can show you as
            connected. That session holds your CoinPay identifier and the
            profile fields CoinPay returns (typically name and email). Clearing
            your cookies ends it.
          </p>
          <p>
            Card numbers and cryptocurrency wallet credentials are entered on
            CoinPay, not here. We never receive them. CoinPay&apos;s handling of
            your payment data is governed by CoinPay&apos;s own privacy policy.
          </p>

          <h3>Credential Sharing: what we never receive</h3>
          <p>
            The LogicSRC credentials app exists to sync secrets between
            providers, so the boundary matters. Secret <em>values</em> are
            encrypted end-to-end on your device before they are stored. We hold
            ciphertext we cannot read. Audit records — who synced which key
            name, to which provider, when, and the resulting key fingerprint —
            are stored in readable form so that a sync is reviewable; key names
            and fingerprints are recorded, secret values are not.
          </p>
          <p>
            The <code>logicsrc</code> CLI and TUI run locally. Running a spec
            validation, a schema check, or a credentials dry run sends nothing
            to us. Only commands that explicitly talk to a hosted endpoint — for
            example <code>logicsrc login</code> — make a network call.
          </p>

          <h3>Server logs</h3>
          <p>
            Like any web service, our hosting produces operational logs
            containing IP addresses, timestamps, request paths, and user-agent
            strings. They are used to keep the service running and to
            investigate abuse and outages, and they are not used to profile
            visitors.
          </p>

          <h3>Cookies</h3>
          <p>
            We set cookies only for functions you initiate: a short-lived
            state cookie during a CoinPay OAuth round trip, and the CoinPay
            session cookie described above. There are no advertising or
            cross-site tracking cookies. The site also registers a service
            worker for offline page caching; it stores pages in your own
            browser and sends us nothing.
          </p>

          <h3>Third parties we rely on</h3>
          <p>
            Our hosting provider, our database provider, CrawlProof for
            analytics, and CoinPay for payments process data on our behalf in
            order to run the service. We do not sell personal data, and we do
            not share it with anyone else except where we are legally required
            to.
          </p>

          <h3>Retention</h3>
          <p>
            Project requests are kept while an engagement is live and afterward
            only as long as we need them for tax and accounting records.
            Operational logs roll off on our provider&apos;s normal schedule.
            Analytics data is aggregate and is not tied back to you.
          </p>

          <h3>Your choices</h3>
          <p>
            You can ask us for a copy of what we hold about you, ask us to
            correct it, or ask us to delete it — write to{" "}
            <a href="mailto:privacy@profullstack.com">privacy@profullstack.com</a>{" "}
            and we will act on it. Deleting an encrypted credential removes the
            ciphertext; the corresponding audit record is retained, because an
            audit trail that can be edited is not an audit trail.
          </p>

          <h3>Children</h3>
          <p>
            This is a developer tool and is not directed at children. We do not
            knowingly collect data from anyone under 16.
          </p>

          <h3>Changes</h3>
          <p>
            We will update this page as the hosted products grow. Material
            changes will be noted in the <a href="/blog">blog</a>. See also our{" "}
            <a href="/terms">Terms</a>.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
