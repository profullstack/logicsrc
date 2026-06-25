import { describe, expect, it } from "vitest";
import {
  C0MPUTE_DEFAULT_BASE_URL,
  C0MPUTE_DEFAULT_MODEL,
  c0mputeConnectorFromEnv,
  createC0mputeModel,
  resolveC0mputeConnector
} from "./index.js";

describe("resolveC0mputeConnector", () => {
  it("applies default base URL and model", () => {
    const resolved = resolveC0mputeConnector({ apiKey: "key" });
    expect(resolved.baseUrl).toBe(C0MPUTE_DEFAULT_BASE_URL);
    expect(resolved.model).toBe(C0MPUTE_DEFAULT_MODEL);
    expect(resolved.apiKey).toBe("key");
  });

  it("keeps explicit base URL and model", () => {
    const resolved = resolveC0mputeConnector({
      apiKey: "key",
      baseUrl: "https://gpu.example/v1",
      model: "llama-3.1-70b"
    });
    expect(resolved.baseUrl).toBe("https://gpu.example/v1");
    expect(resolved.model).toBe("llama-3.1-70b");
  });

  it("throws when not connected (no apiKey)", () => {
    expect(() => resolveC0mputeConnector({ apiKey: "" })).toThrow(/connect a c0mpute\.com account/);
  });
});

describe("c0mputeConnectorFromEnv", () => {
  it("maps C0MPUTE_* env vars", () => {
    const connector = c0mputeConnectorFromEnv({
      C0MPUTE_API_KEY: "k",
      C0MPUTE_API_URL: "https://gpu.example/v1",
      C0MPUTE_MODEL: "m"
    });
    expect(connector).toEqual({ apiKey: "k", baseUrl: "https://gpu.example/v1", model: "m" });
  });

  it("yields an empty apiKey when unset (so resolve will reject)", () => {
    expect(c0mputeConnectorFromEnv({}).apiKey).toBe("");
  });
});

describe("createC0mputeModel", () => {
  it("rejects when the account is not connected", async () => {
    await expect(createC0mputeModel({ apiKey: "" })).rejects.toThrow(/apiKey/);
  });

  it("explains the optional @langchain/openai peer when it is missing", async () => {
    await expect(createC0mputeModel({ apiKey: "key" })).rejects.toThrow(/@langchain\/openai/);
  });
});
