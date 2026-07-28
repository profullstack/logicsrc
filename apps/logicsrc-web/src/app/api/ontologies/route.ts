import { getService, apiJson, apiError } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

// GET /api/ontologies — the ontologies this reference service holds.
export async function GET() {
  const state = await getService();
  if (!state.engine) return apiError("OO-E-UNAVAILABLE", state.error ?? "No ontology is loaded", 503);

  const manifest = state.engine.getOntologyManifest();
  return apiJson(
    {
      ontologies: [
        {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          namespace: manifest.namespace,
          license: manifest.license,
          revision: state.engine.store.revision()
        }
      ],
      persistence: state.persistence,
      note:
        state.persistence === "memory"
          ? "In-memory reference service seeded from the example package; proposals do not survive a restart."
          : undefined
    },
    { revision: state.engine.store.revision() }
  );
}
