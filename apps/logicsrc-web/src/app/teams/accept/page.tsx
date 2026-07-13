import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { TeamsClient } from "@/components/teams-client";

export const metadata: Metadata = {
  title: "Accept invite · LogicSRC Teams",
  description: "Accept a LogicSRC credential-sharing team invite.",
  robots: { index: false },
};

// Invite emails link here as /teams/accept?token=… — log in, then the token is
// auto-accepted by the client.
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<ReactNode> {
  const { token } = await searchParams;
  return (
    <SiteShell active="Credentials">
      <TeamsClient initialToken={token} />
    </SiteShell>
  );
}
