import type { PluginDefinition } from "@logicsrc/plugin-core";
import { coinPayManifest } from "./manifest.js";

export const coinPayPlugin: PluginDefinition = {
  manifest: coinPayManifest,
  configDefaults: {
    enabled: true,
    default_payment_provider: true,
    default_identity_provider: true,
    api_url: "${COINPAY_API_URL}",
    api_key: "${COINPAY_API_KEY}",
    webhook_secret: "${COINPAY_WEBHOOK_SECRET}"
  },
  routes: [
    { method: "POST", path: "/api/plugins/coinpay/did/auth", capability: "did.auth" },
    { method: "POST", path: "/api/plugins/coinpay/escrows", capability: "escrow.create" },
    { method: "POST", path: "/api/plugins/coinpay/webhooks/payment-status", capability: "webhook.payment_status" }
  ],
  events: [
    { event: "task.approved", capability: "escrow.release" },
    { event: "payment.released", capability: "reputation.payment_event" }
  ],
  permissions: [
    "payments:read",
    "payments:request",
    "payments:release",
    "escrows:create",
    "escrows:refund"
  ],
  tuiPanels: [{ id: "coinpay-status", title: "CoinPay" }]
};

export { coinPayManifest };
