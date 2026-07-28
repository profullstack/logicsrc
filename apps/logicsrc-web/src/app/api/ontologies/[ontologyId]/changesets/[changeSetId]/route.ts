import { handle, apiJson, apiError } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ontologyId: string; changeSetId: string }> }
) {
  const { ontologyId, changeSetId } = await params;
  const id = decodeURIComponent(changeSetId);

  return handle(request, ontologyId, (engine) => {
    const changeSet = engine.store.getChangeSet(id);
    if (!changeSet) return apiError("OO-A-NOT-FOUND", `Unknown change set ${id}`, 404);
    return apiJson({
      changeSet,
      diff: engine.diffOntologyChangeSet(id),
      reviews: engine.store.listReviews(id),
      approvals: engine.store.listApprovals(id),
      events: engine.listEvents({ changeSet: id })
    });
  });
}
