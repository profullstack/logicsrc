import { handle, apiJson } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  return handle(request, ontologyId, (engine) =>
    apiJson(engine.getOntologyManifest(), { revision: engine.store.revision() })
  );
}
