import pkg from "../../package.json";

/** Sent on every server-side call to CoinPay so its logs and throttle can tell this app apart. */
export const COINPAY_UA = `logicsrc.com/${pkg.version} (+https://logicsrc.com)`;
