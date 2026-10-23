import { keccak_256 } from "@noble/hashes/sha3.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

/** EIP-55 mixed-case checksum of a 0x address (BNB Smart Chain uses the same address format as Ethereum). */
export function toChecksumAddress(address: string) {
  const hex = address.slice(2).toLowerCase();
  const hash = Array.from(keccak_256(new TextEncoder().encode(hex)), (b) => b.toString(16).padStart(2, "0")).join("");
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  return out;
}

export type AddressCheck = { ok: true; address: string; checksum: string } | { ok: false; error: string };

/**
 * Validates a BNB Smart Chain (BEP20) wallet address. All-lowercase or all-uppercase addresses carry no checksum and
 * are accepted; a mixed-case address must match its EIP-55 checksum exactly (catches a mistyped character). The
 * result is stored lowercase, which is how the chain and the verifier compare addresses.
 */
export function checkBscAddress(input: string): AddressCheck {
  const raw = String(input ?? "").trim();
  if (!ADDRESS.test(raw)) return { ok: false, error: "Enter a BNB Smart Chain address: 0x followed by 40 hexadecimal characters." };
  const body = raw.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (mixed && toChecksumAddress(raw) !== raw) return { ok: false, error: "The address checksum doesn't match. Check for a mistyped character, or paste the address again." };
  const address = raw.toLowerCase();
  if (address === ZERO) return { ok: false, error: "That's the zero address. Funds sent there are lost." };
  return { ok: true, address, checksum: toChecksumAddress(address) };
}
