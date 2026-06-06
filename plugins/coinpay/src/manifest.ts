import type { PluginManifest } from "@logicsrc/plugin-core";

export const coinPayManifest: PluginManifest = {
  id: "coinpay",
  name: "CoinPay",
  version: "1.0.0",
  type: ["payment", "identity", "escrow"],
  default: true,
  capabilities: [
    "did.auth",
    "wallet.connect",
    "payment.request",
    "payment.send",
    "escrow.create",
    "escrow.fund",
    "escrow.release",
    "escrow.refund",
    "webhook.payment_status",
    "reputation.payment_event"
  ],
  commands: ["wallet", "escrow", "pay", "tip"],
  env: ["COINPAY_API_URL", "COINPAY_API_KEY", "COINPAY_WEBHOOK_SECRET"]
};
