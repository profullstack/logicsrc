import { handle, apiJson } from "@/lib/ontology-service";
import { parseBoundedIntegerParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ ontologyId: string }> }) {
  const { ontologyId } = await params;
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "asserted";
  const limit = parseBoundedIntegerParam(url.searchParams.get("limit"), 100, 1, 500);

  return handle(request, ontologyId, (engine) => {
    const claims = engine.store.listClaims({
      subject: url.searchParams.get("subject") ?? undefined,
      predicate: url.searchParams.get("predicate") ?? undefined,
      status: statusParam.split(",").map((value) => value.trim()) as never
    });
    return apiJson({ total: claims.length, limit, claims: claims.slice(0, limit) });
  });
}
