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
      s("openskill", "OpenSkill", "Portable descriptions of human skills, knowledge and occupations, linked from OpenProfile", { status: "draft" }),
      s("openagent", "OpenAgent", "A portable agent profile: identity, owner, skills and requested permissions", { status: "0.1" }),
      s("openwall", "OpenWall", "Consent-based broadcasts and direct messages across contact networks, with an AT Protocol mapping", { landing: undefined, status: "draft" }),
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
      s("openconnection", "OpenConnection", "A setup token you paste: a bridge issues it, any app claims it once for an access URL, no app registration"),
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
      s("openobject", "OpenObject", "A bucket you can mount: keyed objects encrypted by their owner, kept on paid disks at a stated redundancy, verified, repaired and read back by path", { parent: "openserver" }),
      s("openslice", "OpenSlice", "A container whose compute is rented from one market and whose disk is mounted from another: the host descriptor, the slice file and the reservation between them", { parent: "openserver" }),
      s("openmcp", "OpenMCP", "An open catalog of MCP relays: a relay serves /.well-known/openmcp.json and a catalog probes it"),
      s("opencoupon", "OpenCoupon", "One file a merchant serves about what is on offer right now, expired codes kept so directories learn they died"),
      s("opensaas", "OpenSaaS", "One file a subscription service serves about the way in and the way out of every plan, for a person and for an agent"),
      s("openmodel", "OpenModel", "One file a model provider serves about the models it serves and what they cost: price per million tokens, context, modalities and what each model can do", { landing: undefined }),
      s("openaffiliate", "OpenAffiliate", "One file a merchant serves about the commission it pays"),
      s("openrecipe", "OpenRecipe.md", "One Markdown file that is a recipe, with schema.org derived from it and never the reverse"),
      s("opensong", "OpenSong", "One plain-text file that is a song: title, style, exclusions and lyrics as the blocks a generator takes, kept beside the audio"),
      s("openemoji", "OpenEmoji", "An emoji set as a folder: one file that states coverage, licence and whether a person or a model drew it, and glyphs named by the codepoints they draw"),
      s("openicon", "OpenIcon", "An icon set as a folder: every icon named, with aliases, 24x24 currentColor SVGs and a Nerd Font, Unicode and ASCII glyph each, so a terminal draws the best one it can"),
      s("openthreat", "OpenThreat", "One file a security tool serves about what it found in the open: public subjects only, secrets never located"),
      s("openrental", "OpenRental", "One file an operator serves about the agents and file swarms it rents out: members, metadata and rates through CoinPay", { landing: undefined, status: "draft" }),
      s("opensite", "OpenSite", "One record about a page or a site: the card a reader would draw, declared by the site or read from it, kept by an index"),
      s("openstack", "OpenStack.md", "One Markdown file a project serves about what it is built on: every interface and its layers, the rules, what it must never depend on, inherited by the next project through Extends"),
      s("openwebring", "OpenWebring", "A webring that says who made it: one file a ring serves about its members, one a member serves about itself, and made_by on every member"),
      s("openwiki", "OpenWiki", "A wiki that is a folder of Markdown files: [[Page]] links, a small front matter, a descriptor and a page index, every page and revision readable as Markdown, and made_by on every revision"),
      s("openl10n", "OpenL10n", "The record of what a file says, in any language: one transcript per media per language, kept once, translations beside the original", { parent: "openfile" }),
      s("openi18n", "OpenI18n", "One file a service serves about the languages it speaks, which it can turn into which, how to ask for one, and where texts are translated")
    ]
  },
  {
    slug: "process",
    name: "Agents and process",
    line: "How agents coordinate, settle, stream, and how the software that serves them gets built",
    blurb:
      "The lifecycle for building software when agents work in parallel and CI is the only gate, the requirement document an agent can execute, the settlement and proof layer under a peer-to-peer swarm, a lossless byte-stream envelope, the five nouns a shared ontology needs, and the record an agent session carries about who spawned it and under what ceiling.",
    specs: [
      s("asdlc", "ASDLC", "The Agentic Software Development Lifecycle: nine phases, four conformance levels and the ratchet rule"),
      s("openabtest", "OpenABTest", "Portable experiments with sticky assignments, distinct exposure and conversion events, and reconciled profit accounting", { landing: undefined, status: "draft" }),
      s("openprd", "OpenPRD", "A product requirement document an agent can execute and a person can read"),
      s("openswarm", "OpenSwarm", "Settlement and proof of work done under a peer-to-peer swarm"),
      s("openstream", "OpenStream", "A lossless byte-stream relay envelope, with benchmark reports per release", { landing: undefined }),
      s("openontology", "OpenOntology", "Five nouns for a shared ontology, with governance and interoperability notes"),
      s("openfleet", "OpenFleet", "Agents under a human: the record a session carries about who spawned it, for what and under what ceiling, and the ledger its sysop reads"),
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
