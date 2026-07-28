import { handle, apiJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ontologyId: string; claimId: string }> }
) {
  const { ontologyId, claimId } = await params;
  const id = decodeURIComponent(claimId);

  return handle(request, ontologyId, (engine) => {
    const claim = engine.getClaim(id);
    return apiJson({
      claim,
      history: engine.claimHistory(id),
      sources: (claim.sources ?? []).map((sourceId) => engine.store.getSource(sourceId)).filter(Boolean),
      evidence: (claim.evidence ?? []).map((evidenceId) => engine.store.getEvidence(evidenceId)).filter(Boolean)
    });
  });
}
