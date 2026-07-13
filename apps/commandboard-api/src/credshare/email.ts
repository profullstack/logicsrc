import type { CredShareEmailSender } from "./router.js";

/**
 * Resend-backed email transport for login codes and team invites.
 *
 * Returns `undefined` when RESEND_API_KEY is not configured, so the API falls
 * back to echoing codes/tokens in its responses (fine for local dev; production
 * sets the key and never echoes secrets).
 */
export function createResendEmailSender(options: { webBaseUrl: string } = { webBaseUrl: "https://logicsrc.com" }): CredShareEmailSender | undefined {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return undefined;
  const from = process.env.CREDSHARE_EMAIL_FROM || "LogicSRC <noreply@logicsrc.com>";
  const webBaseUrl = process.env.LOGICSRC_WEB_URL || options.webBaseUrl;

  async function send(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend send failed: ${response.status} ${body.slice(0, 200)}`);
    }
  }

  return {
    async sendLoginCode(email, code) {
      await send(
        email,
        "Your LogicSRC login code",
        `<p>Your LogicSRC login code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
        `Your LogicSRC login code is: ${code}\nIt expires in 10 minutes.`
      );
    },
    async sendInvite({ email, token, teamName, teamSlug, invitedByEmail }) {
      const acceptUrl = `${webBaseUrl}/teams/accept?token=${encodeURIComponent(token)}`;
      await send(
        email,
        `You're invited to the "${teamName}" credential team on LogicSRC`,
        `<p><strong>${invitedByEmail}</strong> invited you to share credentials on the <strong>${teamName}</strong> (<code>${teamSlug}</code>) team.</p>
         <p>Accept in the CLI:</p>
         <pre>logicsrc login --email ${email}
logicsrc teams accept ${token}</pre>
         <p>…or <a href="${acceptUrl}">accept on the web</a>. Secrets stay end-to-end encrypted — the server never sees them.</p>`,
        `${invitedByEmail} invited you to the "${teamName}" (${teamSlug}) credential team on LogicSRC.\n\nAccept in the CLI:\n  logicsrc login --email ${email}\n  logicsrc teams accept ${token}\n\nOr on the web: ${acceptUrl}`
      );
    }
  };
}
