import type { SwarmRunInput, SwarmRunner } from "./types.js";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization"
};

export interface SwarmHandlerOptions {
  /** Engine that runs an agent turn (e.g. the deepagents-backed runner). */
  runner: SwarmRunner;
  /**
   * Optional per-request gate, run before the agent. Use it to authenticate,
   * authorize, or meter a call (e.g. enforce an x402 payment). Throw to reject;
   * attach a numeric `status` to the error (see {@link SwarmError}) to control
   * the HTTP status returned.
   */
  onRequest?: (input: SwarmRunInput, request: Request) => void | Promise<void>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS }
  });
}

function statusOf(error: unknown, fallback: number): number {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : fallback;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build a framework-agnostic Web handler `(Request) => Response` that runs a
 * swarm turn. Mount it on any route in the host app — for example a Next route
 * handler (`export const POST = createSwarmHandler({ runner })`), a Hono route,
 * or `tronbrowser.dev/swarm`. The host owns hosting, model keys, storage, and
 * billing; this just turns an HTTP request into a {@link SwarmRunner} call.
 */
export function createSwarmHandler(options: SwarmHandlerOptions): (request: Request) => Promise<Response> {
  const { runner, onRequest } = options;

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let input: SwarmRunInput;
    try {
      const body = (await request.json()) as Partial<SwarmRunInput>;
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return json({ error: "messages must be a non-empty array" }, 400);
      }
      input = { messages: body.messages, rubric: body.rubric, threadId: body.threadId };
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (onRequest) {
      try {
        await onRequest(input, request);
      } catch (error) {
        return json({ error: messageOf(error) }, statusOf(error, 403));
      }
    }

    try {
      const result = await runner.run(input);
      return json(result, 200);
    } catch (error) {
      return json({ error: messageOf(error) }, statusOf(error, 500));
    }
  };
}
