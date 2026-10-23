import "server-only";

/**
 * Read-only checks of a USDT (BEP20) transfer on BNB Smart Chain, through a JSON-RPC endpoint (BSC_RPC_URL; default
 * the official BNB Chain endpoint). Used by administrators before approving an upgrade: approval is impossible unless
 * every check passes. No keys or wallets are involved.
 */
export const BSC = {
  chainId: 56,
  /** Tether USD (BSC-USD) on BNB Smart Chain; 18 decimals. */
  usdt: "0x55d398326f99059ff775485246999027b3197955",
  decimals: 18n,
  minConfirmations: 15,
} as const;

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TX_HASH = /^0x[0-9a-f]{64}$/;

export const rpcUrl = () => process.env.BSC_RPC_URL?.trim() || "https://bsc-dataseed.bnbchain.org";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RPC ${method} failed (${response.status})`);
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message ?? "error"}`);
  return body.result as T;
}

export type Check = { id: string; label: string; ok: boolean; detail: string };
export type TransferVerification = {
  ok: boolean;
  checks: Check[];
  from: string | null;
  amountUnits: string | null;
  blockNumber: number | null;
  blockTime: string | null;
  confirmations: number | null;
  checkedAt: string;
  rpc: string;
};

const hexToBig = (hex: string) => BigInt(hex);
const padAddress = (address: string) => `0x${"0".repeat(24)}${address.toLowerCase().replace(/^0x/, "")}`;
const formatUnits = (units: bigint) => {
  const whole = units / 10n ** BSC.decimals;
  const frac = (units % 10n ** BSC.decimals).toString().padStart(Number(BSC.decimals), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac.slice(0, 6)}` : `${whole}`;
};

/**
 * Verifies that `txHash` is a successful, sufficiently confirmed transfer of at least `minMicros` USDT (6-decimal
 * micro-units) to `recipient`, made at or after `notBefore` (so an older, unrelated transfer can't be claimed).
 */
export async function verifyUsdtTransfer(input: { txHash: string; recipient: string; minMicros: bigint; notBefore: Date }): Promise<TransferVerification> {
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });
  const result: TransferVerification = { ok: false, checks, from: null, amountUnits: null, blockNumber: null, blockTime: null, confirmations: null, checkedAt: new Date().toISOString(), rpc: new URL(rpcUrl()).host };
  const hash = input.txHash.toLowerCase();
  if (!TX_HASH.test(hash)) {
    add("format", "Transaction hash format", false, "Not a 0x-prefixed 64-character hash.");
    return result;
  }
  try {
    const chainId = Number(hexToBig(await rpc<string>("eth_chainId", [])));
    add("chain", "BNB Smart Chain (chain ID 56)", chainId === BSC.chainId, `RPC reports chain ID ${chainId}.`);
    if (chainId !== BSC.chainId) return result;

    const receipt = await rpc<{ status: string; blockNumber: string; logs: { address: string; topics: string[]; data: string }[] } | null>("eth_getTransactionReceipt", [hash]);
    add("found", "Transaction found and mined", Boolean(receipt), receipt ? `Mined in block ${Number(hexToBig(receipt.blockNumber))}.` : "Not found (wrong network, pending, or mistyped).");
    if (!receipt) return result;
    const succeeded = receipt.status === "0x1";
    add("success", "Transaction succeeded", succeeded, succeeded ? "Status: success." : "The transaction failed (reverted).");

    const recipientTopic = padAddress(input.recipient);
    const transfers = receipt.logs.filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3);
    const usdt = transfers.filter((l) => l.address.toLowerCase() === BSC.usdt);
    const toUs = usdt.filter((l) => l.topics[2]?.toLowerCase() === recipientTopic);
    add("token", "USDT (BEP20) transfer", usdt.length > 0, usdt.length ? "Found a Tether USD transfer." : transfers.length ? "A token was transferred, but not USDT on BSC." : "No token transfer in this transaction.");
    add("recipient", "Sent to the Localians wallet", toUs.length > 0, toUs.length ? `To ${input.recipient}.` : "No USDT went to the Localians wallet in this transaction.");
    const best = toUs.map((l) => ({ log: l, value: hexToBig(l.data) })).sort((a, b) => (b.value > a.value ? 1 : -1))[0];
    const minUnits = input.minMicros * 10n ** (BSC.decimals - 6n);
    const enough = Boolean(best && best.value >= minUnits);
    add("amount", `Amount at least ${formatUnits(minUnits)} USDT`, enough, best ? `Received ${formatUnits(best.value)} USDT.` : "No matching amount.");
    if (best) {
      result.amountUnits = best.value.toString();
      result.from = `0x${best.log.topics[1].slice(-40)}`;
    }

    const blockNumber = Number(hexToBig(receipt.blockNumber));
    const [latestHex, block] = await Promise.all([rpc<string>("eth_blockNumber", []), rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [receipt.blockNumber, false])]);
    const confirmations = Number(hexToBig(latestHex)) - blockNumber + 1;
    result.blockNumber = blockNumber;
    result.confirmations = confirmations;
    add("confirmations", `At least ${BSC.minConfirmations} confirmations`, confirmations >= BSC.minConfirmations, `${confirmations} confirmations.`);
    const blockTime = block ? new Date(Number(hexToBig(block.timestamp)) * 1000) : null;
    result.blockTime = blockTime?.toISOString() ?? null;
    add("time", "Paid after the request was made", Boolean(blockTime && blockTime >= input.notBefore), blockTime ? `Block time ${blockTime.toISOString()}.` : "Block time unavailable.");
  } catch (error) {
    add("rpc", "Blockchain lookup", false, error instanceof Error ? error.message.slice(0, 200) : "Lookup failed.");
  }
  result.ok = checks.length > 0 && checks.every((c) => c.ok);
  return result;
}
