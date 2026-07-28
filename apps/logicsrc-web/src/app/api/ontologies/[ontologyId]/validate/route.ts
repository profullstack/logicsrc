import { handle, apiJson, readJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const body = await readJson(request);

  return handle(request, ontologyId, (engine) =>
    apiJson(engine.validateOntologyPackage({ strict: body.strict === true }))
  );
}
