import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CLI_TOKEN_PREFIX = "lcl_";

/** SHA-256 hex. Tokens are high-entropy random values, so a fast hash is appropriate (no password stretching needed). */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** New CLI access token: shown once to the CLI, stored only as a hash. */
export function generateCliToken() {
  const token = `${CLI_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token), prefix: token.slice(0, 10) };
}

export const generateDeviceCode = () => randomBytes(32).toString("base64url");

// RFC 8628 §6.1: no vowels or ambiguous characters, 20^8 ≈ 2.6e10 combinations.
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

function randomFromAlphabet(alphabet: string, length: number) {
  // Rejection sampling keeps the distribution uniform.
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out.push(alphabet[byte % alphabet.length]);
    }
  }
  return out.join("");
}

export const generateUserCode = () => randomFromAlphabet(USER_CODE_ALPHABET, 8);

/** "wdjb-mjht " → "WDJBMJHT" (null if it can't be a user code). */
export function normalizeUserCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/.test(code) ? code : null;
}

export const formatUserCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** 12-character lowercase base32 label (60 bits): unguessable preview hostnames. */
export const generatePreviewLabel = () => randomFromAlphabet("abcdefghijklmnopqrstuvwxyz234567", 12);

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
