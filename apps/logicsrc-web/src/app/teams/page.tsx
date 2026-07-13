import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { TeamsClient } from "@/components/teams-client";

export const metadata: Metadata = {
  title: "Teams · Credential Sharing · LogicSRC",
  description:
    "Manage credential-sharing teams and invites. Share secrets with teammates by email — end-to-end encrypted, so the server never sees plaintext. Decryption happens only in the logicsrc CLI.",
  alternates: { canonical: "/teams" },
};

export default function TeamsPage(): ReactNode {
  return (
    <SiteShell active="Credentials">
      <TeamsClient />
    </SiteShell>
  );
}
