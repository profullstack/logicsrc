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
    const state = typeof body.state === "string" ? body.state : "commented";
    const review = engine.reviewOntologyChangeSet(id, {
      state: state as never,
      comment: typeof body.comment === "string" ? body.comment : undefined,
      operationDecisions: body.operationDecisions as never
    });
    rememberIdempotent(request, { review }, 201);
    return apiJson({ review }, { status: 201 });
  });
}
