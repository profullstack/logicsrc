import {
  handle,
  apiJson,
  readJson,
  idempotentReplay,
  rememberIdempotent
} from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ontologyId: string; changeSetId: string }> }
) {
  const { ontologyId, changeSetId } = await params;
  const id = decodeURIComponent(changeSetId);
  const replay = idempotentReplay(request);
  if (replay) return replay;

  const body = await readJson(request);

  return handle(request, ontologyId, async (engine, serviceState) => {
    const applied = engine.applyOntologyChangeSet(id, {
      skipRejectedOperations: body.skipRejectedOperations === true
    });
    // libSQL buffers writes; make them durable before we report success.
    if (serviceState.flush) await serviceState.flush();
    const payload = {
      changeSet: applied.changeSet.id,
      revision: applied.revision,
      addedEntities: applied.addedEntities,
      addedClaims: applied.addedClaims,
      statusChanges: applied.statusChanges,
      skipped: applied.skipped,
      events: applied.events.map((event) => ({ id: event.id, type: event.type }))
    };
    rememberIdempotent(request, payload, 200);
    return apiJson(payload, { revision: applied.revision });
  });
}
