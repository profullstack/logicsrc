import { describe, expect, it } from "vitest";
import { ArcadeRegistry, renderArcadeList } from "./registry.js";

describe("arcade registry", () => {
  it("renders an empty arcade list without throwing", () => {
    expect(renderArcadeList(new ArcadeRegistry())).toContain("No games registered");
  });
});
