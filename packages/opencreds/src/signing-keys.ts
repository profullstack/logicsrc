/**
 * Signing keys: secrets that move money or open a box on their own — wallet
 * private keys, seed phrases, Lightning hsm_secrets, SSH and deploy keys.
 *
 * After the 2026-10-27 dev2 incident (root on the box drained every wallet
 * whose key sat in an app.env or was pulled there from a vault) these never
 * live in a deployable team vault: `teams push` refuses them, `teams pull`
 * withholds them, and the server never hands them to a machine key. They
 * belong in `logicsrc keyring` (passphrase-sealed, never pulled by a deploy),
 * and a service that signs asks its user to unlock at use time.
 *
 * The NAME rule is what the server enforces, because the server only ever
 * sees names. The VALUE rule is a second net the CLI runs where it holds
 * plaintext, for keys stored under a name nobody would guess.
 *
 * apps/pwa/src/lib/signing-keys.mjs is a copy of the name rule; both are held
 * to signing-keys.fixtures.json.
 */

const norm = (name: string): string => `_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_`;

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

export function isSigningKeyName(name: string): boolean {
  const n = norm(name);
  if (ALWAYS.test(n)) return true;
  if (PRIVATE.test(n)) return !SERVICE.test(n);
  return WALLET.test(n) && !NOT_A_KEY.test(n);
}

/** Does the VALUE look like raw key material? Kept narrow: a false hit blocks a push. */
export function looksLikeSigningKeyValue(value: string): boolean {
  const v = value.trim().replace(/^["']|["']$/g, "");
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(v)) return true;
  // EVM private key written the usual way: 0x + 32 bytes. Bare 64-hex is too
  // common for HMAC and session secrets to call.
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return true;
  // Solana secret key: base58 of 64 bytes (87-88 chars), or the JSON byte array.
  if (/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(v)) return true;
  if (/^\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]$/.test(v)) return true;
  // BIP39 shape: 12/15/18/21/24 short lowercase words.
  const words = v.split(/\s+/);
  return [12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w));
}

export function isSigningKey(name: string, value?: string): boolean {
  return isSigningKeyName(name) || (value !== undefined && looksLikeSigningKeyValue(value));
}
