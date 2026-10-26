import type {
  CursorPage,
  Link,
  LinkListQuery,
  LinkPatch,
  NewLink,
  Page,
  UserOverviewStats,
} from "@/server/domain/types";

/** Who holds a short code; enough to tell "mine, same destination" from "taken". */
export type CodeHolder = Pick<Link, "code" | "userId" | "destinationUrl" | "deletedAt">;

export interface ILinkRepository {
  /** Inserts a link. Throws `UniqueViolationError` when the code is taken (incl. soft-deleted). */
  create(input: NewLink): Promise<Link>;
  findById(id: string): Promise<Link | null>;
  /** Active (not soft-deleted) link by exact, case-sensitive code. */
  findByCode(code: string): Promise<Link | null>;
  /** Holders of the given codes, soft-deleted links included (their codes stay reserved). */
  findCodeHolders(codes: readonly string[]): Promise<CodeHolder[]>;
  list(query: LinkListQuery): Promise<Page<Link>>;
  /** Distinct tags across a user's non-deleted links, sorted alphabetically. `undefined` = every user (admin). */
  listTags(userId: string | undefined): Promise<string[]>;
  listByCursor(userId: string, cursor: string | null, limit: number): Promise<CursorPage<Link>>;
  /** Every non-deleted link owned by a user (data export). */
  listAllByUser(userId: string): Promise<Link[]>;
  update(id: string, patch: LinkPatch): Promise<Link | null>;
  softDelete(ids: readonly string[], at: Date): Promise<number>;
  setEnabled(ids: readonly string[], enabled: boolean): Promise<number>;
  /**
   * Atomically consumes one access if the link is under its limit:
   * `UPDATE … SET click_count = click_count + 1 WHERE … click_count < max_clicks RETURNING destination_url`.
   * Returns the destination, or `null` when the limit is reached.
   */
  consumeAccess(id: string): Promise<string | null>;
  findByClaimTokenHashes(hashes: readonly string[]): Promise<Link[]>;
  /** Clears the claim token and assigns ownership; returns how many links were claimed. */
  claim(ids: readonly string[], userId: string): Promise<number>;
  overview(userId: string | undefined, now: Date): Promise<UserOverviewStats>;
  count(): Promise<number>;
}
