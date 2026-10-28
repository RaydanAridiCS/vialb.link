export interface DeliveryKey {
  kind: "weekly_report" | "broken_links";
  workspaceId: string;
  userId: string;
  /** The scheduled send instant, e.g. `2026-06-01T08`. */
  periodKey: string;
}

/** Idempotency ledger for scheduled emails. */
export interface IEmailDeliveryRepository {
  /**
   * Takes the right to send this email. True for exactly one caller: either nobody tried before, or an
   * earlier attempt claimed it but never finished and its claim is older than `staleBefore`.
   */
  claim(key: DeliveryKey, now: Date, staleBefore: Date): Promise<boolean>;
  markSent(key: DeliveryKey, at: Date): Promise<void>;
  /** Gives the claim back after a failed send so a later pass can retry. */
  release(key: DeliveryKey): Promise<void>;
}
