import { handle, apiJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ontologyId: string; entityId: string }> }
) {
  const { ontologyId, entityId } = await params;
  const id = decodeURIComponent(entityId);

  return handle(request, ontologyId, (engine) => {
    const entity = engine.getEntity(id);
    const claims = engine.store.listClaims({ subject: entity.id });
    return apiJson(
      {
        entity,
        // The old id still resolves after a merge; say so rather than 404ing.
        redirectedFrom: entity.id === id ? undefined : id,
        claims: claims.map((claim) => ({
          id: claim.id,
          predicate: claim.predicate,
          object: claim.object,
          status: claim.status,
          confidence: claim.confidence,
          validTime: claim.validTime,
          sources: claim.sources ?? []
        }))
      },
      { revision: engine.store.revision() }
    );
  });
}
