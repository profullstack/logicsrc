import { getService, apiError, apiJson, engineFor } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/ontologies/{id}/events
 *
 * Returns the event log as JSON, or a live SSE stream when the client asks for
 * text/event-stream. Same event objects either way — the transport does not
 * change the schema.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const bound = await engineFor(request);
  if (!bound) {
    const state = await getService();
    return apiError("OO-E-UNAVAILABLE", state.error ?? "No ontology is loaded", 503);
  }
  if (bound.state.ontologyId !== ontologyId) {
    return apiError("OO-A-NOT-FOUND", `Unknown ontology ${ontologyId}`, 404);
  }

  const url = new URL(request.url);
  const wantsStream =
    (request.headers.get("accept") ?? "").includes("text/event-stream") || url.searchParams.get("stream") === "1";

  const engine = bound.engine;

  if (!wantsStream) {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    return apiJson({ events: engine.listEvents({ limit }) });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown, type: string) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
      };

      // Replay recent history so a late subscriber is not blind to it.
      for (const event of engine.listEvents({ limit: 20 })) send(event, event.type);
      send({ ontology: ontologyId, revision: engine.store.revision() }, "ready");

      const unsubscribe = engine.subscribeOntologyEvents((event) => send(event, event.type));
      const keepAlive = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive"
    }
  });
}
