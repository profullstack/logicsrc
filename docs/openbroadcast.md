# OpenBroadcast

OpenBroadcast is the `Broadcast` section of an [OpenProfile.md](/openprofile): what a person or organisation hosts, live or recorded, on air or online, and what they are looking for on it. A podcast, a radio show, a live audio room, a stream, a newsletter interview series. It is written down on its own so a booking platform, a guest, a directory and a host's own agent all mean the same thing by the same key, and so a host can be matched with a guest from two files rather than two forms. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of the two halves of the broadcaster-and-guest framework; the other is [OpenGuest](/docs/openguest). Both are sections of OpenProfile.md, which is where the person's name, accounts and topics already live.

Slug: `openbroadcast`

## The problem

Every show has a booking page and every booking page is a form. A host who wants guests fills in Podmatch, MatchMaker, a Calendly and a Google Form, and each holds half of what a guest needs to know: what the show is about, who listens, how long a segment runs, whether it is live, what the host is looking for this month. A guest's agent asked "which shows on climate finance are looking for guests and record in the evening, Europe" reads twelve pages twelve ways. The host wrote the answers once, in their head, and typed them into forms that will not hand them back.

The host already has a profile file. The section is what the show needs to say, in it.

## The shape

```markdown
## Broadcast

- **Show**: The Analytical Engine
- **Kind**: podcast
- **Format**: interview
- **Live**: no
- **Cadence**: weekly
- **Length**: 45 min
- **Language**: en
- **Audience**: 12k downloads/episode
- **Since**: 2024-03
- **Feed**: https://ada.example/podcast/feed.xml
- **Listen**: https://ada.example/podcast
- **Topics**: computing history, mathematics, women in science
- **Seeking**: historians, engineers with a story, first-time guests welcome
- **Not**: crypto, product pitches
- **Slots**: Tue and Thu 18:00-20:00 Europe/London
- **Remote**: yes
- **Book**: https://ada.example/podcast/book
- **Pays**: no
- **Charges**: no
```

A person with two shows writes two `## Broadcast` sections, or one section with `### <show name>` groups under it.

## The keys

Every key is optional and every one is kept as written. A reader that understands one uses it, and shows the rest.

About the show:

- `Show`: the name. Absent, the section is the person's unnamed broadcast and the profile's name stands in.
- `Kind`: `podcast`, `radio`, `live-audio`, `stream`, `video`, `newsletter`, `series`, or the host's own word.
- `Format`: `interview`, `panel`, `solo`, `call-in`, `roundtable`, `narrative`, or a list.
- `Live`: `yes`, `no`, or `both`. A live show has `Slots`; a recorded one may too.
- `Cadence`: `daily`, `weekly`, `fortnightly`, `monthly`, `seasonal`, or as written.
- `Length`: a duration as a person writes it, `45 min`, `2 h`.
- `Language`: one or more language tags.
- `Audience`: the host's own figure in the host's own unit: `12k downloads/episode`, `3,000 live listeners`, `40k subscribers`. A reader shows the unit and never compares across units.
- `Since`: when the show started, a year or a month.
- `Feed`: the RSS feed. `Listen`: where a person listens. `Watch`: where a person watches.
- `Network`: the network or station, if any, as a name or an OpenProfile.md URL.
- `Topics`: what the show covers, matched loosely the way OpenProfile.md Topics are. Absent means the profile's Topics.

About who the host is looking for:

- `Seeking`: the guests the host wants, in the host's words: roles, backgrounds, kinds of story. Matched loosely against a guest's `Expertise`, `Topics` and `Pitch`.
- `Not`: what the host will not book. A hit here wins over everything else.
- `Slots`: when recording or airing happens, as written, with a timezone.
- `Remote`: `yes`, `no`, `preferred`, `in-person only`.
- `Book`: the booking URL. Absent, `Email` in the identity block is the way in.
- `Pays`: whether the show pays guests: `no`, `yes`, or an amount. `Charges`: whether the show charges guests to appear: `no`, `yes`, or an amount. Both default to unstated, and a reader shows unstated, because pay-to-play is the thing a guest most wants to know and most often is not told.

Unknown keys are kept, so `Producer`, `Sponsor` and `Rating` all work.

## Matching

A booking platform reads a host's `Broadcast` and a guest's `Guest` section and scores the pair from what both wrote: the host's `Topics` and `Seeking` against the guest's `Expertise` and `Topics`, the host's `Not` against everything the guest said, the guest's `Not` against everything the host said, `Slots` against `Availability`, `Language` against `Languages`, `Remote` against `Remote`, `Pays` and `Charges` against `Rate` and `Pays`. Both `Not` keys are absolute. Everything else is a score, and the platform says how it scored.

The platform never fills a key the person did not write, from the show's feed, the person's photo, or another platform. What is not written is unstated.

## Discovery

The section lives in the person's or the show's OpenProfile.md, found the three ways that document names: `/.well-known/openprofile.md`, `<link rel="openprofile">`, or a platform path. A show with its own domain serves its own profile with `Kind: organization` in the identity block and this section under it; a person who hosts serves the section in their own file and names the show. A directory that meets both keeps both, because the show's file and the host's file are two claims, and a `Host` key in the show's file pointing at the host's profile, with the host's `Accounts` pointing back, is the verification.

## What is deliberately absent

**No episode list.** `Feed` is the episode list, and RSS already is the spec for it.

**No audience verification.** `Audience` is the host's figure. A platform that verifies it labels the verification as its own.

**No booking protocol.** `Book` is a link. What happens there is the platform's business.

**No JSON.** As OpenProfile.md: the Markdown is the canonical copy and any structured view is derived on every read.

## Related standards

- [OpenProfile.md](/openprofile): the file this section lives in; the identity block, Accounts and Topics it relies on.
- [OpenGuest](/docs/openguest): the other half; a guest's `Expertise`, `Availability`, `Rate` and `Pitch` are what this section is matched against.
- [OpenAccess](/openaccess): how a booking platform's agent carries the grant it needs to book on a person's behalf.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the Broadcast section, the show keys, the seeking keys, matching, discovery through a show's or a host's OpenProfile.md. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
