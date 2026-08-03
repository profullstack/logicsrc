import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { credentialProviders } from "@logicsrc/plugin-credential-sharing";
import { renderPageMarkup } from "../src/lib/page-markup";

/**
 * Guards the marketing page against the product.
 *
 * /credential-sharing is hand-written copy in page-markup.ts, while the
 * providers it advertises are a real registry in the plugin. Nothing connected
 * the two: the `team` provider shipped on 2026-07-13 and three weeks later the
 * page still described a five-provider tool with no mention of teams, which is
 * long enough for a reader to conclude the capability did not exist. The docs
 * were correct the whole time -- only the surfaces people actually land on had
 * drifted. These tests turn that drift into a failing build.
 */

// A shipped provider id -> proof that the customer-facing copy mentions it.
// The registry's own `name` is not usable as the proof: `env` is "Local .env
// file" and `team` is "LogicSRC Team Vault", neither of which is how the copy
// reads. So each provider declares what "advertised" looks like for it, and
// the first test below makes adding a provider without an entry a failure.
const MARKETING_PROOF: Record<string, RegExp> = {
  env: /\.env/,
  doppler: /Doppler/,
  railway: /Railway/,
  "github-secrets": /GitHub Secrets/,
  sh1pt: /sh1pt/,
  team: /[Tt]eam vault/
};

const REPO_ROOT = resolve(process.cwd(), "../..");

/** Just the Credential Sharing band, so a stray match elsewhere cannot pass. */
function credentialSection(): string {
  const markup = renderPageMarkup();
  const start = markup.indexOf('<section id="credential-sharing"');
  expect(start, "the credential-sharing section should exist").toBeGreaterThan(-1);
  const end = markup.indexOf("</section>", start);
  return markup.slice(start, end);
}

describe("marketing copy tracks the shipped credential providers", () => {
  it("every shipped provider declares what advertising it looks like", () => {
    const missing = credentialProviders
      .filter((provider) => !MARKETING_PROOF[provider.id])
      .map((provider) => provider.id);

    expect(
      missing,
      `Add these provider ids to MARKETING_PROOF, then make sure the marketing page and README actually say so: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("the credential sharing section names every shipped provider", () => {
    const section = credentialSection();
    const unadvertised = credentialProviders
      .filter((provider) => {
        const proof = MARKETING_PROOF[provider.id];
        return proof ? !proof.test(section) : false;
      })
      .map((provider) => provider.id);

    expect(
      unadvertised,
      `These providers ship but /credential-sharing never mentions them: ${unadvertised.join(", ")}. Update renderPageMarkup in src/lib/page-markup.ts.`
    ).toEqual([]);
  });

  it("the README names every shipped provider", () => {
    const readme = readFileSync(resolve(REPO_ROOT, "README.md"), "utf8");
    const unadvertised = credentialProviders
      .filter((provider) => {
        const proof = MARKETING_PROOF[provider.id];
        return proof ? !proof.test(readme) : false;
      })
      .map((provider) => provider.id);

    expect(
      unadvertised,
      `These providers ship but README.md never mentions them: ${unadvertised.join(", ")}.`
    ).toEqual([]);
  });
});
