import type { NextRequest } from "next/server";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/hire-us/project-request — accept a Hire Us project request before any
// CoinPay invoice is created. Hire Us bills metered hours at $400/hour, so there is
// no amount until we accept the project and hours are approved.
const RATE_USD_PER_HOUR = 400;
const MINIMUM_HOURS = 10;

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
      plan: "400/hour",
      invoice: "pending_acceptance"
    });

    return json(
      {
        success: true,
        request: {
          id: requestId,
          status: "pending_acceptance",
          rate_usd_per_hour: RATE_USD_PER_HOUR,
          billing: "metered_hours",
          minimum_hours: MINIMUM_HOURS,
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
