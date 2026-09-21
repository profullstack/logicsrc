import { readDoc } from "@/lib/docs";

// GET /.well-known/openstack.md: LogicSRC's own OpenStack.md, the file the spec
// at /openstack says a project serves about what it is built on. The body is
// the worked example in docs/openstack.md, the first ```markdown fence, so the
// specification's example and the file this site serves can never disagree.
export function openstackBody(): string {
  const spec = readDoc("openstack") ?? "";
  const match = spec.match(/```markdown\n([\s\S]*?)\n```/);
  return match ? `${match[1]}\n` : "# LogicSRC\n";
}

export function GET(): Response {
  return new Response(openstackBody(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
