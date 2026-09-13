# OpenGuest

OpenGuest is the `Guest` section of an [OpenProfile.md](/openprofile): that a person is available to appear on other people's shows, what they can speak to, when, on what terms, and what they have appeared on before. An expert, an author, a founder, a researcher, a comedian, a caller. It is written down on its own so a booking platform, a host, a directory and the guest's own agent all mean the same thing by the same key, and so a guest can be matched with a show from two files rather than two forms. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of the two halves of the broadcaster-and-guest framework; the other is [OpenBroadcast](/docs/openbroadcast). Both are sections of OpenProfile.md, which is where the person's name, accounts, topics and resume already live.

Slug: `openguest`

## The problem

An expert who is happy to be interviewed has no way to say so that a host's search will find. They fill in a guest-matching site, a speaker bureau, a press page on their own domain and a line in a bio, and each holds a different fragment: the topics on one, the availability on another, the fee nowhere. A host's agent asked "who can talk about analytical engines, records in the evening in Europe, and does not charge" reads a hundred profiles a hundred ways. The person wrote the answers once and gave them away.

The person already has a profile file, and a resume behind it. The section is what a host needs to know, in it.

## The shape

```markdown
## Guest

- **Available**: yes
- **Expertise**: analytical engines, early computing, mathematics education
- **Pitch**: Wrote the first program for a machine that was never built, and can explain why that matters now.
- **Formats**: interview, panel
- **Live**: both
- **Languages**: en, fr
- **Location**: London
- **Timezone**: Europe/London
- **Availability**: weekday evenings, some weekends
- **Remote**: preferred
- **Lead time**: 2 weeks
- **Rate**: free
- **Pays**: no
- **Appeared on**: [The Analytical Engine](https://ada.example/podcast/ep12), [BBC Radio 4](https://bbc.example/in-our-time/babbage)
- **Press**: https://ada.example/press
- **Credentials**: Countess of Lovelace; first published algorithm, 1843
- **Not**: crypto, pay-to-play, politics
- **Book**: https://ada.example/book
```

## The keys

Every key is optional and every one is kept as written.

About the guest:

- `Available`: `yes`, `no`, `selectively`, or a date range. Absent means unstated, and a platform that lists guests shows unstated, not available.
- `Expertise`: the subjects the person can speak to with authority, matched loosely the way OpenProfile.md Topics are. This is the expert half of the framework: an expert is a guest with `Expertise` and `Credentials`, and needs no other section.
- `Pitch`: one or two lines a host can read aloud to decide. It is the guest's own words.
- `Credentials`: why the person is worth hearing on `Expertise`, as written: a title, a book, a paper, a job. The detail lives in the `Resume` link in the identity block.
- `Formats`: `interview`, `panel`, `solo`, `call-in`, `debate`, `live-audio`, or a list. `Live`: `yes`, `no`, `both`.
- `Languages`: one or more language tags, if not already in the identity block.
- `Location`, `Timezone`: where the person is and what clock they keep; both may sit in the identity block instead.
- `Availability`: when, as written: `weekday evenings`, `Tue-Thu`, `not before 2027`. `Lead time`: how much notice is needed.
- `Remote`: `yes`, `no`, `preferred`, `in-person only`.
- `Rate`: what the guest charges to appear: `free`, an amount, or `negotiable`. `Pays`: whether the guest will pay to appear: `no`, `yes`, or an amount. Both default to unstated. A guest who writes `Pays: no` is not shown pay-to-play shows.
- `Appeared on`: past appearances, one per bullet or comma-separated, each a link when there is one. A host reads them to hear the guest before asking.
- `Press`: a press or speaker page. `Book`: where to ask. Absent, `Email` in the identity block is the way in.
- `Not`: what the guest will not do or discuss. A hit here wins over everything else.

Unknown keys are kept, so `Agent`, `Headshot` and `Bio` all work.

## Matching

A booking platform reads a guest's `Guest` and a host's `Broadcast` section and scores the pair from what both wrote: the guest's `Expertise` and `Topics` against the host's `Topics` and `Seeking`, both `Not` keys against everything the other side said, `Availability` against `Slots`, `Languages` against `Language`, `Remote` against `Remote`, `Rate` and `Pays` against `Pays` and `Charges`. Both `Not` keys are absolute. Everything else is a score, and the platform says how it scored.

The platform never fills a key the person did not write, from a resume, a photo, a past episode or another platform. What is not written is unstated. `Appeared on` is the one key a platform may add to, and only with the appearances it booked itself, marked as its own.

## Discovery

The section lives in the person's OpenProfile.md, found the three ways that document names. A platform that lists guests serves each guest's file at a platform path and links it from the guest's page, so a host that only knows the page still finds the file.

## What is deliberately absent

**No ratings.** A host who wants to know how a guest was listens to `Appeared on`.

**No exclusivity.** A guest's file may be read by every platform. A platform that wants a guest to itself has a contract, not a profile.

**No structured taxonomy of expertise.** `Expertise` is the words the person wrote.

**No JSON.** As OpenProfile.md: the Markdown is the canonical copy.

## Related standards

- [OpenProfile.md](/openprofile): the file this section lives in; `Resume` in its identity block is where the credentials are detailed.
- [OpenBroadcast](/docs/openbroadcast): the other half; a host's `Topics`, `Seeking`, `Slots`, `Pays` and `Charges` are what this section is matched against.
- [OpenResume.md](/docs/openresume): what the person has done, at length.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the Guest section, the guest keys, the expert half as Expertise and Credentials, matching, discovery. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
