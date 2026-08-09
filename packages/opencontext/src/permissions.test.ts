import { describe, expect, it } from "vitest";
import { authorize, canWrite, classificationRank, resolveScope, unrestrictedScope, UnknownConsumerError } from "./permissions.js";
import { applyRedactions, detectSecrets, parsePath } from "./redact.js";
import type { ContextObject, Manifest } from "./types.js";

const manifest: Manifest = {
  opencontext: "1.0",
  id: "test",
  roles: {
    everyone: { include: ["mission", "glossary"] },
    support: {
      inherits: ["everyone"],
      include: ["policies.*", "customers.*"],
      exclude: ["policies.internal.*"],
      permissions: ["customer.read", "ticket.write"],
      max_classification: "confidential"
    },
    intern: {
      inherits: ["support"],
      include: ["faq.*"],
      exclude: ["customers.*"],
      max_classification: "internal"
    },
    finance: { include: ["policies.*"], max_classification: "restricted" }
  },
  agents: {
    "support-agent": { roles: ["support"] }
  }
};

function object(overrides: Partial<ContextObject>): ContextObject {
  return { id: "policies.refunds", type: "policy", classification: "internal", ...overrides };
}

describe("scope resolution", () => {
  it("resolves an agent through its roles", () => {
    const scope = resolveScope(manifest, { agent: "support-agent" });
    expect(scope.consumer.id).toBe("support-agent");
    expect(scope.consumer.roles).toEqual(["everyone", "support"]);
    expect(scope.permissions).toContain("ticket.write");
  });

  it("unions includes and excludes across inherited roles", () => {
    const scope = resolveScope(manifest, { role: "support" });
    expect(scope.include).toEqual(expect.arrayContaining(["mission", "glossary", "policies.*", "customers.*"]));
    expect(scope.exclude).toContain("policies.internal.*");
  });

  it("lets a role's own classification ceiling win over the one it inherits", () => {
    // support inherits everyone (which declares nothing) and declares
    // confidential; intern inherits support (confidential) and declares
    // internal. The most specific declaration is the one the author meant.
    expect(resolveScope(manifest, { role: "support" }).maxClassification).toBe("confidential");
    expect(resolveScope(manifest, { role: "intern" }).maxClassification).toBe("internal");
  });

  it("inherits a ceiling only when the role declares none of its own", () => {
    const withBase: Manifest = {
      opencontext: "1.0",
      id: "t",
      roles: {
        base: { include: ["*"], max_classification: "public" },
        child: { inherits: ["base"], include: ["*"] }
      }
    };
    expect(resolveScope(withBase, { role: "child" }).maxClassification).toBe("public");
  });

  it("does not let a shared base role silently cap a role granted more", () => {
    // The footgun this guards against: one `max_classification` on an
    // `everyone` role quietly capping every role in the repository, so a
    // finance role explicitly granted confidential receives nothing above
    // internal — a denial invisible in the manifest.
    const shared: Manifest = {
      opencontext: "1.0",
      id: "t",
      roles: {
        everyone: { include: ["mission"], max_classification: "internal" },
        finance: { inherits: ["everyone"], include: ["policies.*"], max_classification: "confidential" }
      }
    };
    expect(resolveScope(shared, { role: "finance" }).maxClassification).toBe("confidential");
    expect(resolveScope(shared, { role: "everyone" }).maxClassification).toBe("internal");
  });

  it("takes the lowest ceiling when several roles are requested at once", () => {
    // Holding two roles must never grant more than either does alone.
    const scope = resolveScope(manifest, { role: ["support", "intern"] });
    expect(scope.maxClassification).toBe("internal");
  });

  it("falls back to internal when nothing in the chain declares a ceiling", () => {
    const plain: Manifest = { opencontext: "1.0", id: "t", roles: { r: { include: ["*"] } } };
    expect(resolveScope(plain, { role: "r" }).maxClassification).toBe("internal");
  });

  it("carries an inherited exclusion into the child role", () => {
    const intern = resolveScope(manifest, { role: "intern" });
    expect(intern.exclude).toContain("customers.*");
    expect(authorize(object({ id: "customers.acme" }), intern).allowed).toBe(false);
  });

  it("rejects an unknown agent or role by name", () => {
    expect(() => resolveScope(manifest, { agent: "ghost" })).toThrow(UnknownConsumerError);
    expect(() => resolveScope(manifest, { role: "ghost" })).toThrow(/Unknown role "ghost"/);
  });

  it("treats a role name used as an agent as that role", () => {
    const scope = resolveScope(manifest, { agent: "finance" });
    expect(scope.consumer.roles).toEqual(["finance"]);
  });
});

describe("authorization", () => {
  const support = resolveScope(manifest, { role: "support" });

  it("allows what the scope includes", () => {
    expect(authorize(object({ id: "policies.refunds" }), support).allowed).toBe(true);
  });

  it("denies what no include matches", () => {
    const result = authorize(object({ id: "finance.payroll" }), support);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not-in-scope");
  });

  it("lets an exclude beat an include that also matches", () => {
    const result = authorize(object({ id: "policies.internal.margins" }), support);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("scope-exclusion");
    expect(result.detail).toContain("policies.internal.*");
  });

  it("enforces the classification ceiling even when in scope", () => {
    const result = authorize(object({ id: "policies.secret", classification: "restricted" }), support);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("classification-denied");
  });

  it("honours an object-level read grant", () => {
    const denied = authorize(object({ permissions: { read: ["finance"] } }), support);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("permission-denied");

    const allowed = authorize(object({ permissions: { read: ["support"] } }), support);
    expect(allowed.allowed).toBe(true);
  });

  it("lets an explicit deny beat every grant", () => {
    // Deny is checked first and cannot be outvoted by a read grant, an include,
    // or inheritance.
    const result = authorize(object({ permissions: { read: ["support", "*"], deny: ["support"] } }), support);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("permission-denied");
  });

  it("caps the unrestricted local scope at the level asked for", () => {
    const scope = unrestrictedScope("internal");
    expect(authorize(object({ classification: "confidential" }), scope).allowed).toBe(false);
    expect(authorize(object({ classification: "internal" }), scope).allowed).toBe(true);
  });

  it("ranks classifications least to most sensitive", () => {
    expect(classificationRank("public")).toBeLessThan(classificationRank("internal"));
    expect(classificationRank("confidential")).toBeLessThan(classificationRank("restricted"));
  });
});

describe("write authorization", () => {
  const support = resolveScope(manifest, { role: "support" });

  it("refuses a write when no write list names the consumer", () => {
    // Read access never implies write access.
    expect(canWrite(object({}), support)).toBe(false);
    expect(canWrite(object({ permissions: { read: ["support"] } }), support)).toBe(false);
  });

  it("allows a write the object grants", () => {
    expect(canWrite(object({ permissions: { write: ["support"] } }), support)).toBe(true);
  });

  it("lets deny override a write grant", () => {
    expect(canWrite(object({ permissions: { write: ["support"], deny: ["support"] } }), support)).toBe(false);
  });
});

describe("redaction", () => {
  const customer = (): ContextObject => ({
    id: "customers.acme",
    type: "customer",
    content: {
      name: "ACME",
      ssn: "000-00-0000",
      payment: { card: "4111111111111111" },
      contacts: [
        { name: "Dana", email: "dana@acme.example" },
        { name: "Rin", email: "rin@acme.example" }
      ]
    }
  });

  it("removes a field", () => {
    const result = applyRedactions(customer(), [{ path: "ssn" }]);
    expect((result.content as Record<string, unknown>).ssn).toBeUndefined();
    expect(result.redacted).toEqual(["ssn"]);
  });

  it("accepts a path prefixed with the object type", () => {
    // A repository-wide rule written as `customer.ssn` should reach `ssn` on a
    // customer object, which is how authors actually write these.
    const result = applyRedactions(customer(), [{ path: "customer.ssn" }]);
    expect((result.content as Record<string, unknown>).ssn).toBeUndefined();
  });

  it("masks with a replacement", () => {
    const result = applyRedactions(customer(), [{ path: "payment.card", mode: "mask", replacement: "[GONE]" }]);
    expect((result.content as { payment: { card: string } }).payment.card).toBe("[GONE]");
  });

  it("hashes so equality stays testable without disclosure", () => {
    const result = applyRedactions(customer(), [{ path: "contacts[*].email", mode: "hash" }]);
    const contacts = (result.content as { contacts: Array<{ email: string }> }).contacts;
    expect(contacts[0]!.email).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contacts[0]!.email).not.toBe(contacts[1]!.email);
    expect(contacts[0]!.email).not.toContain("dana@");
  });

  it("applies a wildcard-free path to every element of an array", () => {
    const result = applyRedactions(customer(), [{ path: "contacts.email", mode: "mask" }]);
    const contacts = (result.content as { contacts: Array<{ email: string }> }).contacts;
    expect(contacts.every((contact) => contact.email === "[REDACTED]")).toBe(true);
  });

  it("does not mutate the source object", () => {
    const source = customer();
    applyRedactions(source, [{ path: "ssn" }]);
    expect((source.content as Record<string, unknown>).ssn).toBe("000-00-0000");
  });

  it("leaves prose content alone — structured rules have nothing to address", () => {
    const object: ContextObject = { id: "a", type: "note", content: "My ssn is 000-00-0000." };
    const result = applyRedactions(object, [{ path: "ssn" }]);
    expect(result.content).toBe("My ssn is 000-00-0000.");
    expect(result.redacted).toEqual([]);
  });

  it("reports nothing for a path that does not exist", () => {
    expect(applyRedactions(customer(), [{ path: "nope.missing" }]).redacted).toEqual([]);
  });

  it("parses paths with array wildcards and indices", () => {
    expect(parsePath("contacts[*].email")).toEqual([{ key: "contacts" }, { wildcardIndex: true }, { key: "email" }]);
    expect(parsePath("contacts[0].email")).toEqual([{ key: "contacts" }, { index: 0 }, { key: "email" }]);
    expect(parsePath("a.b")).toEqual([{ key: "a" }, { key: "b" }]);
  });
});

describe("secret detection", () => {
  it("flags credentials that must never live in context", () => {
    expect(detectSecrets("AKIAIOSFODNN7EXAMPLE")).toContain("AWS access key id");
    expect(detectSecrets("-----BEGIN RSA PRIVATE KEY-----")).toContain("private key block");
    expect(detectSecrets("api_key = sk_live_abcdefghijklmnop123456")).toContain("generic assigned secret");
  });

  it("does not flag ordinary prose", () => {
    expect(detectSecrets("Refund requests are accepted within 30 days.")).toEqual([]);
    // Talking *about* secrets is not the same as storing one.
    expect(detectSecrets("Store the API key in the secret manager, never here.")).toEqual([]);
  });
});
