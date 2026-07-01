// Convenience builders that produce schema-valid AgentAd documents with sensible
// LogicSRC defaults. Every builder fills `type`/`version` and — for ads — enforces
// the mandatory disclosure contract so an undisclosed ad can never be constructed.

import type { Ad, AdRequest, Campaign, Placement } from "./types.js";
import { assertValid } from "./validate.js";

export const AGENTAD_VERSION = "0.1";

let counter = 0;
function autoId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export type NewAd = Omit<Ad, "type" | "version" | "id" | "disclosure"> & {
  id?: string;
  version?: string;
  disclosure?: Partial<Ad["disclosure"]>;
};

export function createAd(input: NewAd): Ad {
  const ad: Ad = {
    type: "agentad.ad",
    version: input.version ?? AGENTAD_VERSION,
    id: input.id ?? autoId("ad"),
    ...stripMeta(input),
    disclosure: {
      sponsored: true,
      label: input.disclosure?.label ?? "Sponsored",
      ...(input.disclosure?.advertiser_name
        ? { advertiser_name: input.disclosure.advertiser_name }
        : {})
    }
  };
  return assertValid("agentad-ad", ad);
}

export type NewCampaign = Omit<Campaign, "type" | "version" | "id"> & {
  id?: string;
  version?: string;
};

export function createCampaign(input: NewCampaign): Campaign {
  const campaign: Campaign = {
    type: "agentad.campaign",
    version: input.version ?? AGENTAD_VERSION,
    id: input.id ?? autoId("cmp"),
    status: input.status ?? "draft",
    ...stripMeta(input)
  };
  return assertValid("agentad-campaign", campaign);
}

export type NewPlacement = Omit<Placement, "type" | "version" | "id"> & {
  id?: string;
  version?: string;
};

export function createPlacement(input: NewPlacement): Placement {
  const placement: Placement = {
    type: "agentad.placement",
    version: input.version ?? AGENTAD_VERSION,
    id: input.id ?? autoId("plc"),
    ...stripMeta(input)
  };
  return assertValid("agentad-placement", placement);
}

export type NewAdRequest = Omit<AdRequest, "type" | "version"> & { version?: string };

export function createAdRequest(input: NewAdRequest): AdRequest {
  const request: AdRequest = {
    type: "agentad.ad_request",
    version: input.version ?? AGENTAD_VERSION,
    ...stripMeta(input)
  };
  return assertValid("agentad-ad-request", request);
}

// Drop the builder-only override keys so they don't leak into the document and
// trip additionalProperties:false during validation.
function stripMeta<T extends Record<string, unknown>>(input: T): Omit<T, "version" | "id" | "disclosure" | "status"> {
  const { version, id, disclosure, status, ...rest } = input as Record<string, unknown>;
  void version;
  void id;
  void disclosure;
  void status;
  return rest as Omit<T, "version" | "id" | "disclosure" | "status">;
}
