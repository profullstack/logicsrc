/**
 * The one registry of LogicSRC specifications.
 *
 * Everything that lists specs reads this file: the sidebar, /specs and its
 * family pages, the home page's family grid, /docs, the sitemap and llms.txt.
 * Adding a spec is one entry here plus its docs/<slug>.md and, if it has one,
 * its app/<slug>/page.tsx. There is no second list to keep in step.
 *
 * The site starts broad in the sidebar (four families) and drills down:
 * /specs/<family> lists the family's specs, /<slug> is a spec's landing page,
 * /docs/<slug> is the specification text.
 */

export type Spec = {
  slug: string;
  name: string;
  /** One sentence, no trailing period; shown on lists. */
  line: string;
  /** Landing page path when one exists (usually /<slug>). */
  landing?: string;
  /** Specification text path when one exists (usually /docs/<slug>). */
  doc?: string;
  /** A block of a larger spec, listed under it. */
  parent?: string;
  status?: "0.1" | "0.2" | "draft" | "soon";
};

export type Family = {
  slug: string;
  name: string;
  /** One line under the family name. */
  line: string;
  /** A short paragraph on the family page. */
  blurb: string;
  specs: Spec[];
};

const s = (
  slug: string,
  name: string,
  line: string,
  extra: Partial<Spec> = {}
): Spec => ({ slug, name, line, landing: `/${slug}`, doc: `/docs/${slug}`, ...extra });

export const FAMILIES: Family[] = [
  {
    slug: "people",
    name: "People and agents",
    line: "Who someone is, what they have done, and what they offer, in files they own",
    blurb:
      "One Markdown file for a person or an agent, served from their own domain and linked from every platform that has a page for them. The profile carries the identity, the accounts and the topics; the sections carry what a platform needs to match on, so a job board, a booking site or a dating app reads the file instead of asking forty questions again.",
    specs: [
      s("openprofile", "OpenProfile.md", "One Markdown file for who you are and where you are, people and agents alike", { status: "0.2" }),
      s("openresume", "OpenResume.md", "What you have done, in the same spirit, linked from the profile", { landing: undefined }),
      s("openjob", "OpenJob", "What the work is, so a candidate's agent and a job board agree", { landing: undefined }),
      s("openbroadcast", "OpenBroadcast", "The Broadcast section: the show a person hosts and who they are seeking"),
      s("openguest", "OpenGuest", "The Guest section: that a person will appear, their expertise, availability and terms"),
      s("agentbyte", "AgentByte", "Agent screening sessions, policy events and APIs", { doc: "/docs/agent-screening", status: "draft" })
    ]
  },
  {
    slug: "access",
    name: "Access and credentials",
    line: "Grants you can carry, and the vault the tokens live in",
    blurb:
      "OAuth 2.1 with a grant you can carry between apps, a portable vault format for the credentials behind an agent's accounts, and the sync architecture that moves team secrets between the places they are kept.",
    specs: [
      s("openaccess", "OpenAccess", "OAuth 2.1 with a grant you can carry: one hub account, apps keep their own users, entitlements travel"),
      s("opencreds", "OpenCreds", "A portable vault for the credentials behind an agent's accounts"),
      s("credential-sharing", "Credential Sharing", "End-to-end-encrypted team vaults with source and target diffs, approval, sync, rollback and audit")
    ]
  },
  {
    slug: "catalogs",
    name: "Catalogs a site serves about itself",
    line: "One file at a fixed URL, read by directories instead of scraped",
    blurb:
      "A provider, a merchant, a scanner or a relay already keeps a table of what it sells or found. Each of these is that table, exported at /.well-known/<slug>.json in a shape every reader agrees on, verified by the origin it came from. Directories such as nichedb.dev read the file; the publisher stays the author.",
    specs: [
      s("openserver", "OpenServer", "One file a hosting provider serves about what it sells: every offer, its specs, price, location and stock"),
      s("opencpu", "OpenCPU", "The compute block: threads against cores, allocation, and a range for what a buyer can dial", { parent: "openserver" }),
      s("openmemory", "OpenMemory", "The memory block: mebibytes, DDR type, ECC as three states, allocation", { parent: "openserver" }),
      s("opendisk", "OpenDisk", "The disk a machine will rent: free GiB, price per GiB-month, location, policy", { parent: "openserver" }),
      s("opengpu", "OpenGPU", "The gpu block: the card by vendor name, count, VRAM, interconnect, access", { parent: "openserver" }),
      s("openbandwidth", "OpenBandwidth", "The network block: port, meter, overage, IPv4 and IPv6 as a priced resource", { parent: "openserver" }),
      s("openfile", "OpenFile", "One file a publisher serves about the files it has published: hash, swarm and HTTP routes", { parent: "openserver" }),
      s("openmcp", "OpenMCP", "An open catalog of MCP relays: a relay serves /.well-known/openmcp.json and a catalog probes it"),
      s("opencoupon", "OpenCoupon", "One file a merchant serves about what is on offer right now, expired codes kept so directories learn they died"),
      s("openaffiliate", "OpenAffiliate", "One file a merchant serves about the commission it pays"),
      s("openrecipe", "OpenRecipe.md", "One Markdown file that is a recipe, with schema.org derived from it and never the reverse"),
      s("openthreat", "OpenThreat", "One file a security tool serves about what it found in the open: public subjects only, secrets never located")
    ]
  },
  {
    slug: "process",
    name: "Agents and process",
    line: "How agents coordinate, settle, stream, and how the software that serves them gets built",
    blurb:
      "The lifecycle for building software when agents work in parallel and CI is the only gate, the requirement document an agent can execute, the settlement and proof layer under a swarm, a lossless byte-stream envelope, and the five nouns a shared ontology needs.",
    specs: [
      s("asdlc", "ASDLC", "The Agentic Software Development Lifecycle: nine phases, four conformance levels and the ratchet rule"),
      s("openprd", "OpenPRD", "A product requirement document an agent can execute and a person can read"),
      s("openswarm", "OpenSwarm", "Settlement and proof of work done under a peer-to-peer swarm"),
      s("openstream", "OpenStream", "A lossless byte-stream relay envelope, with benchmark reports per release", { landing: undefined }),
      s("openontology", "OpenOntology", "Five nouns for a shared ontology, with governance and interoperability notes"),
      s("agent-swarm", "AgentSwarm", "Provider-neutral agent orchestration, model routing and cost controls", { doc: undefined, status: "soon" }),
      s("openspec", "OpenSpec.dev comparison", "How LogicSRC compares with OpenSpec.dev, and the compatibility mode", { doc: "/docs/openspec-comparison" })
    ]
  }
];

/** Guides that are documentation rather than a specification. Listed on /docs under their own heading. */
export const GUIDES: Array<{ slug: string; name: string }> = [
  { slug: "data-model", name: "Data model" },
  { slug: "cli", name: "CLI" },
  { slug: "tui", name: "TUI" },
  { slug: "config", name: "Config" },
  { slug: "permissions", name: "Permissions" },
  { slug: "plugins", name: "Plugins" },
  { slug: "openontology-governance", name: "OpenOntology governance" },
  { slug: "openontology-interoperability", name: "OpenOntology interoperability" }
];

export function allSpecs(): Spec[] {
  return FAMILIES.flatMap((f) => f.specs);
}

export function familyBySlug(slug: string): Family | undefined {
  return FAMILIES.find((f) => f.slug === slug);
}

export function familyOfSpec(slug: string): Family | undefined {
  return FAMILIES.find((f) => f.specs.some((x) => x.slug === slug));
}

/** The docs/<slug>.md files served at /docs/<slug>: every spec that has one, then the guides. */
export function docSlugs(): string[] {
  const fromSpecs = allSpecs()
    .map((x) => x.doc)
    .filter((d): d is string => Boolean(d))
    .map((d) => d.replace(/^\/docs\//, ""));
  return Array.from(new Set([...fromSpecs, ...GUIDES.map((g) => g.slug)]));
}

/** Top-level specs of a family, each with the blocks that nest under it. */
export function familyTree(family: Family): Array<{ spec: Spec; children: Spec[] }> {
  return family.specs
    .filter((x) => !x.parent)
    .map((spec) => ({ spec, children: family.specs.filter((c) => c.parent === spec.slug) }));
}
