import { handle, apiJson, apiError, readJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const body = await readJson(request);

  return handle(request, ontologyId, (engine) => {
    const resultId = typeof body.resultId === "string" ? body.resultId : null;
    if (!resultId) return apiError("OO-E-REQUEST", "resultId is required", 422);
    return apiJson(engine.explainOntologyResult(resultId, Number(body.row ?? 0)));
  });
}
