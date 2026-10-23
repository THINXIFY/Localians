/** Client-safe plan vocabulary (the server decides; see src/server/plans.ts). */
export type PlanSummary = {
  free: { state: "available" } | { state: "active"; endsAt: string } | { state: "used"; endedAt: string } | { state: "limit_reached"; resetsAt: string };
  /** When paid access ends (renewals included), if the project has an active 7-Day Pass. */
  pass: { endsAt: string } | null;
  /** Pass ended but the custom URL is still reserved until then (renew to keep it). */
  graceUntil: string | null;
  /** The project's latest upgrade request. */
  request: { orderId: string; status: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED"; txHash: string | null; note: string | null } | null;
  /** Whether a share can start right now. */
  canShare: boolean;
  freeLimit: number;
};

/** What the payment step shows (the server supplies these; the QR only when its image was verified). */
export type PaymentInfo = {
  enabled: boolean;
  amountLabel: string;
  networkLabel: string;
  /** Only sent when payments are enabled (the deposit address is never shown otherwise). */
  recipient: string | null;
  qrUrl: string | null;
  supportEmail: string;
  afterPaymentMessage: string;
};

export const ORDER_STATUS_LABEL: Record<NonNullable<PlanSummary["request"]>["status"], string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const isOpenRequest = (r: PlanSummary["request"]) => r?.status === "PENDING" || r?.status === "UNDER_REVIEW";
