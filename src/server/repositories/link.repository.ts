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
export type CodeHolder = Pick<Link, "code" | "userId" | "workspaceId" | "destinationUrl" | "deletedAt">;

/** Optional filters of the cursor-paginated list (the REST API). */
export interface LinkCursorFilter {
  /** Normalized tag. */
  tag?: string;
  /** A folder id, or `none`. */
  folder?: string;
}

export interface ILinkRepository {
  /** Inserts a link. Throws `UniqueViolationError` when the code is taken (incl. soft-deleted). */
  create(input: NewLink): Promise<Link>;
  findById(id: string): Promise<Link | null>;
  /** Active (not soft-deleted) links with these ids, in no particular order. */
  findManyByIds(ids: readonly string[]): Promise<Link[]>;
  /** Active (not soft-deleted) link by exact, case-sensitive code. */
  findByCode(code: string): Promise<Link | null>;
  /** The live link behind a public stats token, if any. */
  findByStatsToken(token: string): Promise<Link | null>;
  /** Holders of the given codes, soft-deleted links included (their codes stay reserved). */
  findCodeHolders(codes: readonly string[]): Promise<CodeHolder[]>;
  list(query: LinkListQuery): Promise<Page<Link>>;
  /** Distinct tags across a workspace's non-deleted links, sorted alphabetically. `undefined` = every workspace (admin). */
  listTags(workspaceId: string | undefined): Promise<string[]>;
  /** Bio page buttons (kind `bio_button`) are excluded from lists unless the query asks for `any`. */
  listByCursor(
    workspaceId: string,
    cursor: string | null,
    limit: number,
    filter?: LinkCursorFilter,
  ): Promise<CursorPage<Link>>;
  /**
   * Hands live links of `fromWorkspaceId` to `toWorkspaceId` and takes them out of any folder (folders belong to a
   * workspace). Everything else about a link, clicks included, stays. Returns how many moved.
   */
  moveToWorkspace(ids: readonly string[], fromWorkspaceId: string, toWorkspaceId: string): Promise<number>;
  /** Files these links in a folder (or none). Returns how many changed. */
  setFolder(ids: readonly string[], folderId: string | null): Promise<number>;
  /** Every non-deleted link a user created, in any workspace (data export). */
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
  /** Clears the claim token and moves unclaimed links into a workspace; returns how many were claimed. */
  claim(ids: readonly string[], userId: string, workspaceId: string): Promise<number>;
  overview(workspaceId: string | undefined, now: Date): Promise<UserOverviewStats>;
  count(): Promise<number>;
}
