import { handle, apiJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

// GET /api/ontologies/{id}/entities?type=&q=&limit=&offset=
export async function GET(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  return handle(request, ontologyId, (engine) => {
    if (q) {
      const matches = engine.findEntities({ text: q, type, limit });
      return apiJson({
        total: matches.length,
        matches: matches.map((match) => ({
          id: match.entity.id,
          type: match.entity.type,
          canonicalName: match.entity.canonicalName,
          status: match.entity.status ?? "active",
          score: match.score,
          matchedOn: match.matchedOn,
          evidence: match.evidence
        }))
      });
    }

    const all = engine.store.listEntities({ type });
    return apiJson({
      total: all.length,
      limit,
      offset,
      entities: all.slice(offset, offset + limit).map((entity) => ({
        id: entity.id,
        type: entity.type,
        canonicalName: entity.canonicalName,
        status: entity.status ?? "active",
        aliases: entity.aliases ?? [],
        externalIds: entity.externalIds ?? {}
      }))
    });
  });
}
