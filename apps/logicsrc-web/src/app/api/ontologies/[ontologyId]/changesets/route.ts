import {
  handle,
  apiJson,
  apiError,
  readJson,
  idempotentReplay,
  rememberIdempotent
} from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  return handle(request, ontologyId, (engine) =>
    apiJson({
      changeSets: engine.store.listChangeSets().map((changeSet) => ({
        id: changeSet.id,
        title: changeSet.title,
        status: changeSet.status,
        createdBy: changeSet.createdBy,
        createdAt: changeSet.createdAt,
        operations: changeSet.operations.length,
        requiredApprovals: changeSet.requiredApprovals ?? 0,
        approvals: engine.store.listApprovals(changeSet.id).length
      }))
    })
  );
}

// POST — create a PROPOSED change set. Requires ontology:claim:propose.
export async function POST(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const replay = idempotentReplay(request);
  if (replay) return replay;

  const body = await readJson(request);
  return handle(request, ontologyId, (engine) => {
    const title = typeof body.title === "string" ? body.title : null;
    const operations = Array.isArray(body.operations) ? body.operations : null;
    if (!title || !operations || operations.length === 0) {
      return apiError("OO-E-REQUEST", "title and a non-empty operations array are required", 422);
    }

    const changeSet = engine.createOntologyChangeSet({
      title,
      rationale: typeof body.rationale === "string" ? body.rationale : undefined,
      runId: typeof body.runId === "string" ? body.runId : undefined,
      operations: operations as never
    });
    const payload = { changeSet, diff: engine.diffOntologyChangeSet(changeSet.id) };
    rememberIdempotent(request, payload, 201);
    return apiJson(payload, { status: 201, revision: engine.store.revision() });
  });
}
