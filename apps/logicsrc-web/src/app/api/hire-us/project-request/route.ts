import type { NextRequest } from "next/server";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/hire-us/project-request — accept a Hire Us project request before a
// recurring CoinPay invoice is created (invoice is created after acceptance).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 160) : "";
    const project = typeof body.project === "string" ? body.project.trim().slice(0, 4000) : "";

    if (!contact || project.length < 20) {
      return json({ success: false, error: "Contact and a project description are required" }, 422);
    }

    const requestId = `hire_${Date.now()}`;
    console.log("[hire-us] project request received", {
      id: requestId,
      contact,
      project_length: project.length,
      plan: "250/week",
      invoice: "pending_acceptance"
    });

    return json(
      {
        success: true,
        request: {
          id: requestId,
          status: "pending_acceptance",
          amount_usd: 250,
          interval: "week",
          invoice: "created_after_acceptance"
        }
      },
      202
    );
  } catch (error) {
    console.error("[hire-us] project request failed", error);
    return json({ success: false, error: "Unable to submit project request" }, 500);
  }
}
