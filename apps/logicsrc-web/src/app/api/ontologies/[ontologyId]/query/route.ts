import { handle, apiJson, apiError, readJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

// POST /api/ontologies/{id}/query — portable triple-pattern query.
export async function POST(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const body = await readJson(request);

  return handle(request, ontologyId, (engine) => {
    const saved = typeof body.savedQuery === "string" ? body.savedQuery : null;
    const query = body.query as Record<string, unknown> | undefined;
    if (!saved && !query) {
      return apiError("OO-E-REQUEST", "Provide savedQuery or query", 422);
    }

    const result = engine.queryOntology(
      (saved ?? query) as never,
      (body.params as Record<string, unknown>) ?? undefined
    );

    return apiJson(
      {
        resultId: result.id,
        columns: result.columns,
        rows: result.rows.map((row) => ({ ...row.bindings, claims: row.claims })),
        explanation: result.explanation
      },
      { revision: engine.store.revision() }
    );
  });
}
