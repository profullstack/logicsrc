import { describe, expect, it } from "vitest";
import { NAME_RE, memberId, nextSwarmOfOne, slug, swarmId } from "./swarm.js";

describe("swarm ids", () => {
  it("mints <slug>-<HHMM UTC>: the spec's create-two-0541", () => {
    expect(swarmId("create two ...", new Date("2026-09-13T05:41:01Z"))).toBe("create-two-0541");
    expect(swarmId("Ship the OpenFleet reference implementation, then promote it", new Date("2026-09-13T23:59:59Z"))).toBe("ship-the-openfleet-refe-2359");
  });

  it("slugs to a leading letter, lowercase, at most 23 characters, never empty", () => {
    expect(slug("2024 report")).toBe("report");
    expect(slug("!!!")).toBe("swarm");
    expect(slug("a".repeat(40)).length).toBe(23);
    expect(slug("abc-def-ghi-jkl-mno-pqr-stu")).toBe("abc-def-ghi-jkl-mno-pqr");
  });

  it("member ids stay valid moshcode pane names up to sixteen members", () => {
    const swarm = swarmId("x".repeat(30), new Date("2026-09-13T05:41:01Z"));
    for (let n = 1; n <= 16; n += 1) expect(memberId(swarm, n)).toMatch(NAME_RE);
  });

  it("mints a swarm of one as <parent>-<n> past the ones already minted", () => {
    expect(nextSwarmOfOne("460a4502", [])).toBe("460a4502-1");
    expect(nextSwarmOfOne("460a4502", ["460a4502-1", "create-two-0541", "460a4502-3"])).toBe("460a4502-4");
    expect(nextSwarmOfOne("a.b", ["a.b-2", "axb-9"])).toBe("a.b-3");
  });
});
