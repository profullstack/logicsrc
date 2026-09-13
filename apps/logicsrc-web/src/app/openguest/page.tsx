import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ProfileSectionPage, type ProfileSection } from "@/components/profile-section-page";

export const metadata: Metadata = {
  title: "OpenGuest · LogicSRC",
  description:
    "OpenGuest is the Guest section of an OpenProfile.md: that a person is available to appear on shows, their expertise and credentials, formats, availability, rate, past appearances and dealbreakers, so a guest and a host are matched from two files rather than two forms. An expert is a guest with Expertise and Credentials.",
  alternates: { canonical: "/openguest" }
};

const SPEC: ProfileSection = {
  name: "OpenGuest",
  slug: "openguest",
  section: "Guest",
  tagline:
    "That a person will appear on other people's shows, what they can speak to, when, on what terms, and where they have been heard before.",
  problem:
    "An expert who is happy to be interviewed has no way to say so that a host's search will find. They fill in a guest-matching site, a speaker bureau, a press page and a line in a bio, and each holds a fragment: topics on one, availability on another, the fee nowhere. A host's agent asked who can talk about analytical engines, records in the evening in Europe and does not charge reads a hundred profiles a hundred ways.",
  sample: `## Guest

- **Available**: yes
- **Expertise**: analytical engines, early computing, mathematics education
- **Pitch**: Wrote the first program for a machine that was never built, and can explain why that matters now.
- **Formats**: interview, panel
- **Live**: both
- **Languages**: en, fr
- **Timezone**: Europe/London
- **Availability**: weekday evenings, some weekends
- **Remote**: preferred
- **Lead time**: 2 weeks
- **Rate**: free
- **Pays**: no
- **Appeared on**: [The Analytical Engine](https://ada.example/podcast/ep12), [BBC Radio 4](https://bbc.example/babbage)
- **Credentials**: Countess of Lovelace; first published algorithm, 1843
- **Not**: crypto, pay-to-play, politics
- **Book**: https://ada.example/book`,
  keys: [
    ["Available", "yes, no, selectively, or a date range", "Absent is unstated, never available."],
    ["Expertise, Credentials, Pitch", "loosely matched words; as written; one or two lines", "The expert half of the framework: an expert is a guest with Expertise and Credentials. Detail lives in the Resume link."],
    ["Formats, Live, Languages", "interview, panel, solo, call-in, debate, live-audio; yes / no / both; language tags", "What the guest will do."],
    ["Location, Timezone, Availability, Lead time, Remote", "as written", "When and how the guest can appear."],
    ["Rate, Pays", "free, an amount, negotiable; no, yes, an amount", "What the guest charges, and whether they will pay to appear. A guest who writes Pays: no is not shown pay-to-play shows."],
    ["Appeared on, Press, Book", "links", "Past appearances a host can listen to; a press page; where to ask."],
    ["Not", "loosely matched words", "What the guest will not do or discuss. Wins over everything else."]
  ],
  matching:
    "A booking platform reads a guest's Guest and a host's Broadcast section and scores the pair from what both wrote: Expertise and Topics against Topics and Seeking, Availability against Slots, Languages against Language, Remote against Remote, Rate and Pays against Pays and Charges. Both Not keys are absolute. The platform never fills a key the person did not write; Appeared on is the one key it may add to, only with the appearances it booked itself, marked as its own.",
  absent: [
    ["No ratings", "A host who wants to know how a guest was listens to Appeared on."],
    ["No exclusivity", "Every platform may read the file. A platform that wants a guest to itself has a contract, not a profile."],
    ["No taxonomy of expertise", "Expertise is the words the person wrote."],
    ["No JSON", "The Markdown is the canonical copy."]
  ],
  counterpart: ["OpenBroadcast", "openbroadcast"]
};

export default function OpenGuestPage(): ReactNode {
  return <ProfileSectionPage spec={SPEC} />;
}
