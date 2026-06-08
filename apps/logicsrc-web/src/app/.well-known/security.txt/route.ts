const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /.well-known/security.txt (RFC 9116).
export function GET(): Response {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = `Contact: mailto:security@profullstack.com
Expires: ${expires}
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
