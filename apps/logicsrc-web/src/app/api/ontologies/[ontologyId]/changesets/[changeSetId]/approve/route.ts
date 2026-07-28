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
    const approval = engine.approveOntologyChangeSet(id, {
      comment: typeof body.comment === "string" ? body.comment : undefined
    });
    rememberIdempotent(request, { approval }, 201);
    return apiJson({ approval }, { status: 201 });
  });
}
