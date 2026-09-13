import Link from "next/link";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { listSkills } from "@/lib/skills";
import { pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenSkill · Human skills and knowledge · LogicSRC",
  description: "Portable descriptions of human skills, knowledge and occupations, linked to ESCO and O*NET and carried in OpenProfile.",
  alternates: { canonical: "/openskill" }
};

export default function OpenSkillPage() {
  const concepts = listSkills();
  return (
    <SiteShell active="OpenSkill">
      <section className="band">
        <div className="section-head">
          <p className="eyebrow">People and agents · Draft 0.1</p>
          <h1>OpenSkill</h1>
          <p>What you know. What you can do.</p>
        </div>
        <p>Branding, accounting, software engineering, hardware architecture. Describe a human capability in a small Markdown file, connect it to an established taxonomy, and carry it between profiles, portfolios and job boards.</p>
        <p><Link className="button-primary" href="/docs/openskill">Read the specification</Link>{" · "}<Link href="/openprofile">Use it in OpenProfile</Link>{" · "}<a href="/openskill/catalog.md">Markdown catalog</a></p>
      </section>
      <section className="band">
        <div className="section-head"><h2>A starting vocabulary</h2><p>Skills describe activity; knowledge describes a subject; occupations describe roles. Each entry has its own editable Markdown source.</p></div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead><tr><th style={th}>Concept</th><th style={th}>Kind</th><th style={th}>Description</th></tr></thead>
            <tbody>{concepts.map((concept) => <tr key={concept.slug}>
              <td style={td}><Link href={`/openskill/${concept.slug}`}>{concept.name}</Link></td>
              <td style={td}>{concept.kind ?? "Unstated"}</td>
              <td style={td}>{concept.description}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p>These initial examples cover design, finance and computing. The format accepts other domains and local concepts, including concepts with no taxonomy match.</p>
      </section>
      <section className="band">
        <div className="section-head"><h2>Add it to your profile</h2><p>Plain words work. Links add a shared meaning.</p></div>
        <pre style={pre}>{"## Skills\n\n- [Branding](https://logicsrc.com/openskill/branding)\n- [Logo design](https://logicsrc.com/openskill/logo-design)\n- Accounting\n- [Software engineer](https://logicsrc.com/openskill/software-engineer)"}</pre>
        <p>A profile entry is a claim. Experience, self-assessment and evidence stay with the person making it. An occupation label does not establish a credential or a license.</p>
      </section>
      <section className="band">
        <div className="section-head"><h2>Connected to existing knowledge</h2></div>
        <p><a href="https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api">ESCO</a> provides linked skills, knowledge and occupations. <a href="https://www.onetcenter.org/content.html">O*NET</a> describes occupations and their requirements. OpenSkill records explicit mappings, while keeping the description small enough to read and carry on its own.</p>
        <p>These are descriptive capability records. Executable agent procedures retain their separate <code>SKILL.md</code> format. Reading a capability never installs a tool or grants it permission to act.</p>
      </section>
    </SiteShell>
  );
}
