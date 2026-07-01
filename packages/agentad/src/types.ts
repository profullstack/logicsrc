// TypeScript contract types mirroring the @logicsrc/schemas agentad-*.schema.json
// documents. These are hand-maintained views of the canonical JSON Schemas; the
// runtime source of truth is validation via ./validate.ts.

export type AdFormat = "text" | "markdown" | "ansi" | "banner" | "json";
export type Surface = "cli" | "tui" | "agent" | "ci";
export type PricingModel = "cpm" | "cpc" | "cpa" | "flat";
export type Consumer = "human" | "agent";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type ClickAction = "click" | "open_url" | "copy_command" | "install" | "convert";
export type NoFillReason = "no_inventory" | "frequency_capped" | "blocked_category" | "invalid_request";

export interface Disclosure {
  sponsored: true;
  label: string;
  advertiser_name?: string;
}

export interface AdPricing {
  model: PricingModel;
  bid: number;
  currency: string;
}

export interface AdTargeting {
  surfaces?: Surface[];
  keywords?: string[];
  tools?: string[];
  languages?: string[];
  exclude_keywords?: string[];
}

export interface Ad {
  type: "agentad.ad";
  version: string;
  id: string;
  campaign_id?: string;
  advertiser_did: string;
  format: AdFormat;
  title: string;
  body?: string;
  url: string;
  cta?: string;
  disclosure: Disclosure;
  machine_readable?: Record<string, unknown>;
  targeting?: AdTargeting;
  media?: { ansi_art?: string; icon?: string };
  pricing?: AdPricing;
  expires_at?: string;
}

export interface CampaignBudget {
  total: number;
  daily_cap?: number;
  currency: string;
}

export interface Campaign {
  type: "agentad.campaign";
  version: string;
  id: string;
  advertiser_did: string;
  name: string;
  status?: CampaignStatus;
  budget: CampaignBudget;
  schedule?: { start_at?: string; end_at?: string };
  ad_ids?: string[];
}

export interface Placement {
  type: "agentad.placement";
  version: string;
  id: string;
  publisher_did: string;
  surface: Surface;
  accepted_formats: AdFormat[];
  dimensions?: { max_width?: number; max_lines?: number };
  context_tags?: string[];
  frequency_cap?: { max_per_session?: number; max_per_day?: number };
  allow_categories?: string[];
  block_categories?: string[];
}

export interface AdRequest {
  type: "agentad.ad_request";
  version: string;
  placement_id: string;
  publisher_did?: string;
  consumer?: Consumer;
  context?: { tool?: string; keywords?: string[]; language?: string; locale?: string };
  format_override?: AdFormat;
  count?: number;
}

export interface ServedAd {
  ad: Ad;
  impression_token: string;
  rendered?: string;
}

export interface AdResponse {
  type: "agentad.ad_response";
  version: string;
  request_id: string;
  ads: ServedAd[];
  no_fill_reason?: NoFillReason;
}

export interface Impression {
  type: "agentad.impression";
  version: string;
  impression_token: string;
  ad_id: string;
  placement_id?: string;
  consumer?: Consumer;
  occurred_at: string;
}

export interface Click {
  type: "agentad.click";
  version: string;
  click_token: string;
  ad_id: string;
  placement_id?: string;
  action?: ClickAction;
  consumer?: Consumer;
  occurred_at: string;
}
