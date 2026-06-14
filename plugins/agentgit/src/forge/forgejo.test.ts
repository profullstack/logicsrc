import { describe, expect, it, vi } from "vitest";
import { ForgejoAdapter, type FetchLike } from "./forgejo.js";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function makeFetch(routes: Record<string, { status?: number; json?: unknown }>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.replace("https://git.example.com/api/v1", "");
    calls.push({ method, path, body: init?.body ? JSON.parse(init.body) : undefined });
    const route = routes[`${method} ${path}`] ?? routes[path];
    const status = route?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (route?.json === undefined ? "" : JSON.stringify(route.json))
    };
  };
  return { fetch, calls };
}

function adapterWith(routes: Record<string, { status?: number; json?: unknown }>) {
  const { fetch, calls } = makeFetch(routes);
  const adapter = new ForgejoAdapter({ baseUrl: "https://git.example.com", token: "t", fetch });
  return { adapter, calls };
}

describe("ForgejoAdapter", () => {
  it("creates a user only when missing", async () => {
    const { adapter, calls } = adapterWith({
      "GET /users/alice": { status: 404 },
      "POST /admin/users": { json: { id: 1 } }
    });
    const result = await adapter.ensureUser({ username: "alice", email: "alice@x.com", password: "pw" });
    expect(result.created).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /users/alice", "POST /admin/users"]);
    const createBody = calls[1].body as Record<string, unknown>;
    expect(createBody.must_change_password).toBe(true);
  });

  it("is a no-op when the user already exists", async () => {
    const { adapter, calls } = adapterWith({ "GET /users/alice": { json: { id: 1 } } });
    const result = await adapter.ensureUser({ username: "alice", email: "alice@x.com", password: "pw" });
    expect(result.created).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("creates a repo for a user via the admin endpoint", async () => {
    const { adapter, calls } = adapterWith({
      "POST /admin/users/alice/repos": {
        json: { name: "demo", default_branch: "main", clone_url: "c", html_url: "h", private: true, owner: { login: "alice" } }
      }
    });
    const repo = await adapter.createRepo({ owner: "alice", name: "demo", private: true });
    expect(repo).toMatchObject({ owner: "alice", name: "demo", private: true });
    expect((calls[0].body as Record<string, unknown>).auto_init).toBe(true);
  });

  it("assembles a pull request from pulls + reviews + status", async () => {
    const { adapter } = adapterWith({
      "GET /repos/alice/demo/pulls/7": {
        json: {
          number: 7,
          title: "Add feature",
          user: { login: "bob" },
          head: { ref: "feature", sha: "abc1234" },
          base: { ref: "main" },
          state: "open",
          merged: false
        }
      },
      "GET /repos/alice/demo/pulls/7/reviews": {
        json: [
          { state: "APPROVED", user: { login: "carol" } },
          { state: "PENDING", user: { login: "dave" } }
        ]
      },
      "GET /repos/alice/demo/commits/abc1234/status": {
        json: { statuses: [{ context: "ci", status: "success", target_url: "u" }] }
      }
    });

    const pr = await adapter.getPullRequest("alice", "demo", 7);
    expect(pr.number).toBe(7);
    expect(pr.authorLogin).toBe("bob");
    expect(pr.reviews).toEqual([{ reviewerLogin: "carol", decision: "approve", body: undefined, submittedAt: undefined }]);
    expect(pr.checks).toEqual([{ name: "ci", status: "passing", url: "u" }]);
  });

  it("throws a typed error on non-2xx", async () => {
    const { adapter } = adapterWith({ "GET /repos/alice/demo": { status: 500, json: { message: "boom" } } });
    await expect(adapter.getRepo("alice", "demo")).rejects.toThrow(/Forgejo GET .* 500/);
  });

  it("uses the injected fetch, never a real network", async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, text: async () => "[]" }));
    const adapter = new ForgejoAdapter({ baseUrl: "https://git.example.com/", token: "t", fetch });
    await adapter.listBranches("alice", "demo");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
