import { describe, expect, it } from "vitest";
import { MailAccessError, type MailIdentity } from "./access.js";
import { AgentMailService } from "./service.js";
import { InMemoryMailTransport, type SeedMessage } from "./transports/memory.js";

const paid: MailIdentity = { name: "alice", paid: true };
const free: MailIdentity = { name: "bob", paid: false };
const domain = "mail.profullstack.com";

function seeded() {
  const seed: SeedMessage[] = [
    { mailbox: "INBOX", from: { name: "Carol", address: "carol@example.com" }, subject: "Welcome", text: "hi alice", date: "2026-06-01T10:00:00.000Z", uid: 1 },
    { mailbox: "INBOX", from: { address: "deploy@ci.example.com" }, subject: "Build passed", text: "all green", date: "2026-06-02T10:00:00.000Z", uid: 2 }
  ];
  return new InMemoryMailTransport(seed);
}

function service(identity: MailIdentity, transport = seeded()) {
  return { svc: new AgentMailService({ transport, identity, domain }), transport };
}

describe("access gating", () => {
  it("blocks every call for a non-paid identity", async () => {
    const { svc } = service(free);
    await expect(svc.inbox()).rejects.toThrow(MailAccessError);
    await expect(svc.mailboxes()).rejects.toThrow(MailAccessError);
    await expect(svc.send({ to: [{ address: "x@y.com" }], subject: "s", text: "t" })).rejects.toThrow(MailAccessError);
  });
});

describe("address", () => {
  it("is the member's local part on the mail domain", () => {
    const { svc } = service(paid);
    expect(svc.address()).toBe("alice@mail.profullstack.com");
  });
});

describe("inbox / list", () => {
  it("returns newest-first summaries", async () => {
    const { svc } = service(paid);
    const inbox = await svc.inbox();
    expect(inbox.map((m) => m.uid)).toEqual([2, 1]);
    expect(inbox[0].subject).toBe("Build passed");
  });
});

describe("read", () => {
  it("marks a message seen by default and peek leaves it unseen", async () => {
    const { svc, transport } = service(paid);
    const m = await svc.read("INBOX", 1);
    expect(m?.seen).toBe(true);
    expect((await transport.readMessage("INBOX", 1))?.seen).toBe(true);

    transport.add({ mailbox: "INBOX", from: { address: "z@z.com" }, subject: "Peek", text: "x", uid: 9 });
    await svc.read("INBOX", 9, { peek: true });
    expect((await transport.readMessage("INBOX", 9))?.seen).toBe(false);
  });

  it("returns null for an unknown uid", async () => {
    const { svc } = service(paid);
    expect(await svc.read("INBOX", 999)).toBeNull();
  });
});

describe("search", () => {
  it("matches subject, sender, and body across mailboxes", async () => {
    const { svc } = service(paid);
    expect((await svc.search("green")).map((m) => m.uid)).toEqual([2]);
    expect((await svc.search("carol@example.com")).map((m) => m.uid)).toEqual([1]);
  });
});

describe("send", () => {
  it("stamps From, normalizes, and lands in Sent", async () => {
    const { svc, transport } = service(paid);
    const res = await svc.send({ to: [{ address: "carol@example.com" }], subject: "  Hello  ", text: "hi" });
    expect(res.messageId).toMatch(/@mail\.profullstack\.com>$/);
    const sent = await transport.listMessages({ mailbox: "Sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0].from.address).toBe("alice@mail.profullstack.com");
    expect(sent[0].subject).toBe("Hello");
  });

  it("rejects a draft with no recipients", async () => {
    const { svc } = service(paid);
    await expect(svc.send({ to: [], subject: "x", text: "y" })).rejects.toThrow(/recipient/);
  });
});

describe("reply", () => {
  it("addresses the sender, prefixes Re:, and threads via In-Reply-To", async () => {
    const { svc, transport } = service(paid);
    const original = await svc.read("INBOX", 1, { peek: true });
    await svc.reply(original!, "thanks");
    const sent = await transport.listMessages({ mailbox: "Sent" });
    expect(sent[0].to[0].address).toBe("carol@example.com");
    expect(sent[0].subject).toBe("Re: Welcome");
    const full = await transport.readMessage("Sent", sent[0].uid);
    expect(full?.references).toContain(original!.messageId);
  });
});

describe("flags and delete", () => {
  it("flags, unflags, and deletes", async () => {
    const { svc, transport } = service(paid);
    await svc.flag("INBOX", 1);
    expect((await transport.readMessage("INBOX", 1))?.flagged).toBe(true);
    await svc.delete("INBOX", 1);
    expect(await transport.readMessage("INBOX", 1)).toBeNull();
  });
});
