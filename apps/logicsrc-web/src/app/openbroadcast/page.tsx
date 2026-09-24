import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { ProfileSectionPage, type ProfileSection } from "@/components/profile-section-page";

export const metadata: Metadata = specMetadata(
  "/openbroadcast",
  "OpenBroadcast is the Broadcast section of an OpenProfile.md: the show a person hosts (podcast, radio, live audio, stream), its format, cadence, audience, topics and slots, and who the host is seeking, so a host and a guest are matched from two files rather than two forms."
);

const SPEC: ProfileSection = {
  name: "OpenBroadcast",
  slug: "openbroadcast",
  section: "Broadcast",
  tagline:
    "What a person hosts, live or recorded, on air or online, and who they are looking for on it.",
  problem:
    "Every show has a booking page and every booking page is a form. A host who wants guests fills in four of them, and each holds half of what a guest needs to know: what the show is about, who listens, how long a segment runs, whether it is live, what the host wants this month. A guest's agent asked which shows on climate finance record in the evening in Europe reads twelve pages twelve ways. The host wrote the answers once and typed them into forms that will not hand them back.",
  sample: `## Broadcast

- **Show**: The Analytical Engine
- **Kind**: podcast
- **Format**: interview
- **Live**: no
- **Cadence**: weekly
- **Length**: 45 min
- **Language**: en
- **Audience**: 12k downloads/episode
- **Feed**: https://ada.example/podcast/feed.xml
- **Topics**: computing history, mathematics, women in science
- **Seeking**: historians, engineers with a story, first-time guests welcome
- **Not**: crypto, product pitches
- **Slots**: Tue and Thu 18:00-20:00 Europe/London
- **Remote**: yes
- **Book**: https://ada.example/podcast/book
- **Pays**: no
- **Charges**: no`,
  keys: [
    ["Show, Kind, Format", "name; podcast, radio, live-audio, stream, video, newsletter, series; interview, panel, solo, call-in, roundtable, narrative", "What the show is. Two shows are two sections, or ### groups in one."],
    ["Live, Cadence, Length, Language, Since", "yes / no / both; weekly, monthly, seasonal; a duration; language tags; a year or month", "As the host writes them."],
    ["Audience", "the host's figure in the host's unit", "12k downloads/episode, 3,000 live listeners. A reader shows the unit and never compares across units."],
    ["Feed, Listen, Watch, Network", "URLs; a name or OpenProfile.md URL", "Feed is the episode list; RSS already is the spec for it."],
    ["Topics, Seeking, Not", "loosely matched words", "What the show covers, who the host wants, what the host will not book. Not wins over everything."],
    ["Slots, Remote, Book", "as written with a timezone; yes / no / preferred / in-person only; URL", "When and how a guest appears, and where to ask."],
    ["Pays, Charges", "no, yes, or an amount", "Whether the show pays guests and whether it charges them. Unstated by default, because pay-to-play is the thing a guest is most often not told."]
  ],
  matching:
    "A booking platform reads a host's Broadcast and a guest's Guest section and scores the pair from what both wrote: Topics and Seeking against Expertise and Topics, Slots against Availability, Language against Languages, Remote against Remote, Pays and Charges against Rate and Pays. Both Not keys are absolute. Everything else is a score, and the platform says how it scored. The platform never fills a key the person did not write.",
  absent: [
    ["No episode list", "Feed is the episode list, and RSS already is the spec."],
    ["No audience verification", "Audience is the host's figure. A platform that verifies it labels the verification as its own."],
    ["No booking protocol", "Book is a link. What happens there is the platform's business."],
    ["No JSON", "The Markdown is the canonical copy; a structured view is derived on every read."]
  ],
  counterpart: ["OpenGuest", "openguest"]
};

export default function OpenBroadcastPage(): ReactNode {
  return <ProfileSectionPage spec={SPEC} />;
}
