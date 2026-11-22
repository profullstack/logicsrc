import { readFileSync } from "node:fs";

// Sent on every server-side call to CoinPay so its logs and throttle can tell
// app.logicsrc.com apart from the other apps on the same box.
let version = "";
try {
  version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version || "";
} catch {}

export const COINPAY_UA = `app.logicsrc.com${version ? `/${version}` : ""} (+https://app.logicsrc.com)`;
