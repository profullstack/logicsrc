// Copy of the NAME rule in packages/opencreds/src/signing-keys.ts (read the
// reasoning there). The server only sees secret names, so this is what it
// enforces: a machine key never receives or writes a signing key. Both copies
// are held to packages/opencreds/src/signing-keys.fixtures.json.

const norm = (name) => `_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_`;

/** Seed phrases and raw key material, whatever service they belong to. */
const ALWAYS = /_(MNEMONIC|SEED_PHRASE|SEEDPHRASE|SEED_WORDS|RECOVERY_PHRASE|XPRV|XPRIV|HSM_SECRET|KEYPAIR|KEY_PAIR)_/;
/** "Private key" in any spelling, and SSH / deploy keys that open a box. */
const PRIVATE = /_(PRIVATE_KEY|PRIV_KEY|PRIVKEY|PRIVATEKEY|SIGNING_KEY|SIGNER_KEY|SSH_KEY|DEPLOY_KEY)(_|$)/;
/** App keys that sign tokens or pushes, not funds; needed by a running service. */
const SERVICE = /_(VAPID|GITHUB_APP|GH_APP|JWT|JWK|DKIM|APNS|APPLE|FIREBASE|GOOGLE|GCP|SERVICE_ACCOUNT|SAML|OIDC|WEBHOOK|TLS|SSL|CERT|CLERK|SUPABASE)_/;
/** A wallet word next to KEY / SECRET / SEED: SOLANA_SECRET_KEY, RELAYER_KEY, WALLET_SEED. */
const WALLET = /_(SOLANA|SOL|EVM|ETH|ETHEREUM|BTC|BITCOIN|WALLET|HOT_WALLET|RELAYER|TREASURY|SIGNER|OPERATOR|DEPLOYER|PAYER|FEE_PAYER)_([A-Z0-9]+_)*(KEY|SECRET|SEED)_/;
/** ...unless it is plainly an address, an RPC or an API credential. */
const NOT_A_KEY = /_(RPC|API|URL|ADDRESS|ADDR|PUBLIC|PUBKEY|PUB|ID|NAME)_/;

export function isSigningKeyName(name) {
  const n = norm(name);
  if (ALWAYS.test(n)) return true;
  if (PRIVATE.test(n)) return !SERVICE.test(n);
  return WALLET.test(n) && !NOT_A_KEY.test(n);
}
