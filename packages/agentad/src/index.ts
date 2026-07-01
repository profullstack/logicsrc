// @logicsrc/agentad — AgentAd Marketplace reference exchange.
// See docs/agentad-marketplace.md (AgentBBS milestone M5) and docs/agentad.md.

export * from "./types.js";
export {
  AGENTAD_VERSION,
  createAd,
  createCampaign,
  createPlacement,
  createAdRequest,
  type NewAd,
  type NewCampaign,
  type NewPlacement,
  type NewAdRequest
} from "./builders.js";
export {
  validate,
  assertValid,
  agentAdSchemas,
  type AgentAdSchemaKind,
  type ValidationResult
} from "./validate.js";
export {
  mintToken,
  verifyToken,
  type TokenKind,
  type TokenPayload,
  type VerifyResult
} from "./tokens.js";
export {
  InMemorySettlement,
  type SettlementProvider,
  type InMemorySettlementOptions
} from "./settlement.js";
export {
  AgentAdExchange,
  type AgentAdExchangeOptions,
  type RequestOptions,
  type ConfirmImpressionResult,
  type LedgerEntry
} from "./exchange.js";
