# OpenSkill

OpenSkill is a small, portable Markdown description of something a person can do, a subject they know, or an occupation they practise. Branding, logo design, investing, accounting, software engineering and hardware architecture can be named, described and linked from the same profile. People, organizations and agents can reference the same concepts.

Status: **0.1 — draft**. This publication supplies a reference catalog and an optional OpenProfile section. It does not claim to catalog all human knowledge or to certify anyone's competence.

Slug: `openskill`

## The shape

A name and a sentence are enough:

```markdown
# Logo design

Create a recognizable visual mark that identifies a person, organization or product.
```

A publisher can add context without changing the format:

```markdown
# Logo design

- **Id**: https://logicsrc.com/openskill/logo-design
- **Kind**: skill
- **Domain**: Design
- **Language**: en
- **Aliases**: logo creation, logo development

Create a recognizable visual mark that identifies a person, organization or product.

## Includes

- Concept development, typography, geometry and optical balance.
- Vector artwork, monochrome variants and small-size readability.

## Related

- [Branding](https://logicsrc.com/openskill/branding)

## Taxonomy

- **Broader match**: [ESCO: design graphics](http://data.europa.eu/esco/skill/f058bf62-70d1-4f5e-be2a-8b26fac24a96)
```

The concept describes the capability. A person's experience, proficiency and evidence belong in their profile. A brand's particular colors and logo files belong in its project brief.

## Three kinds

| Kind | What it describes | Examples |
| --- | --- | --- |
| `skill` | A capability expressed through activity | Branding, logo design, investing, software development |
| `knowledge` | A subject someone understands | Accounting, computer science, hardware architectures |
| `occupation` | A role that combines capabilities and knowledge | Investor, accountant, financial advisor, software engineer, hardware architect |

Kind is optional; omission means unstated. Preserve unfamiliar kinds. A role does not establish every skill associated with it, and knowing a subject does not establish practical proficiency. The format can describe academic subjects, crafts, care work and other human capabilities beyond these initial examples.

## Reading and writing

The first top-level heading names the concept. The optional bullet list immediately below it carries `Key: value` pairs; bold keys are a display choice. The first prose paragraph before a second-level heading is the short description. Other prose and sections remain part of the document. Code fences are examples, not metadata.

Common keys are `Id`, `Kind`, `Domain`, `Language` and `Aliases`. The Id is a stable absolute URI, independent of the displayed name or the location of a downloaded copy. If no Id exists, retain the source URL when there is one; a local unnamed identity stays local. Do not merge concepts solely because their names match. `Language` uses a BCP 47 tag; missing language stays unstated. Aliases are alternative labels for the same concept in the stated language, separated by commas. Domain is a browsing label, not a required taxonomy or a closed list.

Useful sections include `Includes`, `Excludes`, `Broader`, `Related`, `Taxonomy` and `Examples`. Broader links name more general concepts; Related links connect associated concepts without declaring a hierarchy. A reader may follow more than one broader concept, and must bound traversal and handle cycles. Unknown keys, unknown sections and their original text are retained. Markdown remains the source; a search index or JSON view is derived from it.

A translation keeps the concept Id when its meaning is unchanged and declares its own Language. A substantive scope change receives a new Id with a link to its predecessor. Do not silently turn a narrow skill into a broad occupation under an existing identifier.

## Reuse existing taxonomies

[ESCO](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api) supplies linked concepts for skills, knowledge and occupations. Its concept URIs identify the concepts across labels and languages. [O*NET](https://www.onetcenter.org/content.html) describes occupations together with knowledge, skills, abilities and work activities. These are useful foundations for work-related terms; neither is presented here as an exhaustive classification of all human knowledge. Other established subject vocabularies can be linked in the same way.

OpenSkill provides a short description and explicit mappings. A reader can use the referenced taxonomy's classification when it needs more detail. A publisher does not need to download an entire taxonomy or obtain a central registration to describe a local concept.

Under `## Taxonomy`, each bullet names its relationship and links to an actual concept:

| Key | Meaning, from this concept to the linked concept |
| --- | --- |
| Exact match | Equivalent meaning and scope |
| Close match | Substantial overlap with a meaningful difference |
| Broader match | The linked concept is more general |
| Narrower match | The linked concept is more specific |
| Related match | Associated, with no equivalence or hierarchy claim |

These correspond to [SKOS mapping properties](https://www.w3.org/TR/skos-reference/#mapping). They are statements by the document's publisher, not endorsements by the taxonomy owner. Inspect the referenced definition before selecting a relationship. A matching label, a search result or a model's guess is insufficient for an Exact match. Unmapped concepts are valid. Preserve the original URI, including an ESCO `http://data.europa.eu/...` identifier; transport redirects do not rename the concept.

Record the taxonomy version and review date in prose when known. Do not invent a version. When a taxonomy retires a concept, retain the old link and document its replacement. A failed lookup means unavailable, not invalid or equivalent to a different result. Attribute source descriptions and observe the source's reuse terms when copying them. The reference catalog uses short descriptions written for OpenSkill and labels its mappings as publisher judgments.

## OpenProfile integration

An optional Skills section lists capabilities in plain language or links them to definitions:

```markdown
## Skills

- [Branding](https://logicsrc.com/openskill/branding)
- [Logo design](https://logicsrc.com/openskill/logo-design)
- Accounting
- [Software engineer](https://logicsrc.com/openskill/software-engineer)
```

For more detail, use a third-level heading in the same section:

```markdown
### Logo design

- **Concept**: https://logicsrc.com/openskill/logo-design
- **Level**: advanced, self-assessed
- **Evidence**: [Selected identity projects](https://designer.example/portfolio)
- **Last used**: 2026-09
```

The examples above are illustrative profiles. A profile can link directly to an ESCO or another vocabulary's URI without creating an OpenSkill wrapper. A linked OpenSkill record is useful when the person needs a shorter description, local scope or several mappings.

Plain labels remain valid and may be offered as search suggestions. Readers keep a named concept, its source, the person's statement and any evidence separate. A profile entry is a claim. A portfolio link is evidence someone offered; it is not automatically independent verification. Levels are kept as written, including the scale and assessor when supplied. Absence does not mean beginner, expert or zero experience. Do not invent scores or translate unlike rating scales without a stated mapping.

Listing an occupation does not establish a credential, a professional license, employment or permission to act for another person. Optional credentials and assessment links belong to the claimant, with issuer and scope when available. An organization listing a capability does not establish that every member has it. An agent listing one does not establish human qualifications. Hiring, access and execution remain the consuming application's decisions.

OpenProfile readers that do not understand Skills retain the section under their existing unknown-section rule. No existing profile fields become required. OpenAgent's existing `skills` array remains a list of specialty labels; this convention does not change its JSON Schema or turn those strings into executable content.

## Publication and portability

Serve a concept at any stable URL. A conventional downloadable filename is `openskill.md`, served as `text/markdown; charset=utf-8`, without an attachment requirement. For example, `/openskill/logo-design` is the human page and `/openskill/logo-design/openskill.md` is its Markdown source. HTML pages may link to the source using `rel="alternate"` and `type="text/markdown"`.

A catalog is a page or a Markdown list of links to concepts. OpenProfile's Skills section is enough for profile discovery; no account, central registry, new well-known path or executable installer is required. Relative links resolve against the source document URL. Readers retain that URL when saving locally and resolve relative links before moving the document to another origin. Public catalogs may enable CORS for browser readers. Each publisher controls the terms it serves.

## Relationship to agent instructions

OpenSkill is descriptive. A reader must not execute code, install tools, follow embedded instructions or grant permissions on the strength of a capability description. [Agent Skills](https://agentskills.io/specification) uses `SKILL.md` packages to give an agent procedures and resources. The formats serve different purposes and retain different names. A procedure may reference an OpenSkill concept to say what capability it helps exercise; possessing that procedure does not prove the capability.

## Reference implementation

The [catalog](/openskill) publishes a small set of editable Markdown concepts covering the initial design, finance and engineering examples. Each has a human page and a raw Markdown download. A [Markdown index](/openskill/catalog.md) lists the names, kinds, descriptions and source URLs in one file. The website derives both catalogs from the concept files and preserves the complete source. [/openprofile/skills](/openprofile/skills) leads to the same catalog. The catalog is a starting vocabulary, not an exhaustive ontology or an ESCO/O*NET certification service.

The [logo design concept](/openskill/logo-design) links to the NicheDB identity as an example of an output. It makes no claim about a person's credentials or who should be hired. The future `w3bs.org/standards/design` page may reference these concepts when published; this draft does not claim conformance with that pending reference.

## Related standards

- [OpenProfile.md](/openprofile): the person, organization or agent making a capability claim.
- [OpenResume.md](/docs/openresume): experience and work history.
- [OpenJob](/docs/openjob): capabilities a piece of work calls for.
- [OpenOntology](/openontology): richer provenance and governed relationships when needed.
- [OpenAgent](/openagent): an agent's identity and advertised specialties.

## License

The specification and original reference descriptions are CC BY 4.0. Linked taxonomies and example artifacts keep their own terms.
