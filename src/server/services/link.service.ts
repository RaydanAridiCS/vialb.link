import {
  CODE_DEFAULT_LENGTH,
  CODE_MAX_ATTEMPTS_PER_LENGTH,
  CODE_MAX_LENGTH_GROWTH,
  CUSTOM_CODE_PATTERN,
  DEFAULT_QR_BG,
  DEFAULT_QR_FG,
  LIMITS,
  RATE_LIMITS,
  RESERVED_CODES,
  type ExpirationPreset,
} from "@/lib/constants";
import type {
  Actor,
  Link,
  LinkHealth,
  LinkPatch,
  LinkSort,
  LinkStatusFilter,
  NewLink,
  Page,
} from "@/server/domain/types";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UniqueViolationError,
  ValidationError,
} from "@/server/errors";
import {
  DEFAULT_QR_ECC,
  isScannable,
  normalizeFrameText,
  QR_ECC_LEVELS,
  QR_FRAMES,
  type QrEcc,
  type QrFrame,
} from "@/lib/qr-options";
import { normalizePixels, pixelsProblem, type LinkPixels } from "@/lib/pixels";
import { isRoutingPlatform, normalizeCountries, routingProblem, type RoutingRule } from "@/lib/routing";
import { parseCardDesign, type CardDesign } from "@/lib/social-card";
import { isValidTag, normalizeTag, normalizeTags } from "@/lib/tags";
import { earliest, resolveExpiresAt } from "@/server/lib/expiry";
import { randomToken, sha256Hex } from "@/server/lib/hashing";
import type { Clock } from "@/server/ports/clock";
import type { CodeGenerator } from "@/server/ports/code-generator";
import type { PasswordHasher } from "@/server/ports/password-hasher";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import type { AbuseService } from "./abuse.service";
import { assertCanManageLink, isAdmin, requireLinkWriter, requireUser } from "./authorization";
import type { Permission } from "@/lib/permissions";
import { toLinkDto, type LinkDto } from "./dto";
import type { SettingsService } from "./settings.service";
import type { IWorkspaceRepository } from "@/server/repositories/workspace.repository";
import type { IFolderRepository } from "@/server/repositories/folder.repository";
import type { ILinkHealthRepository } from "@/server/repositories/link-health.repository";
import { folderNameProblem, normalizeFolderName } from "@/lib/folders";

export interface ExpirationInput {
  preset: ExpirationPreset;
  customAt?: Date | null;
}

export interface CreateLinkCommand {
  destinationUrl: string;
  customCode?: string;
  title?: string | null;
  tags?: string[];
  /** File the new link in this folder (must belong to the actor's workspace). */
  folderId?: string | null;
  routingRules?: RoutingRule[];
  cardDesign?: CardDesign | null;
  pixels?: LinkPixels | null;
  expiration?: ExpirationInput;
  maxClicks?: number | null;
  password?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  qrFgColor?: string;
  qrBgColor?: string;
  qrEcc?: QrEcc;
  qrFrame?: QrFrame;
  qrFrameText?: string | null;
}

export interface UpdateLinkCommand {
  destinationUrl?: string;
  title?: string | null;
  /** `undefined` keeps the current tags; an array replaces them. */
  tags?: string[];
  /** `undefined` keeps the folder, `null` takes the link out of its folder. */
  folderId?: string | null;
  /** `true` turns the public stats page on (keeping its address), `false` turns it off. */
  publicStats?: boolean;
  /** Turns conversion tracking (the `vclid` added to the destination) on or off. */
  conversionsEnabled?: boolean;
  /** `undefined` keeps the current routing rules; an array (even empty) replaces them. */
  routingRules?: RoutingRule[];
  /** `undefined` keeps the current card, `null` removes it. */
  cardDesign?: CardDesign | null;
  /** `undefined` keeps the current pixels, `null` removes them. */
  pixels?: LinkPixels | null;
  /** `undefined` keeps the current expiration. */
  expiration?: ExpirationInput;
  maxClicks?: number | null;
  /** `undefined` keeps, `null` removes, a string sets a new password. */
  password?: string | null;
  isEnabled?: boolean;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  qrFgColor?: string;
  qrBgColor?: string;
  qrEcc?: QrEcc;
  qrFrame?: QrFrame;
  qrFrameText?: string | null;
}

export interface ImportRowCommand {
  /** Row number in the uploaded file, echoed back in the result. */
  row: number;
  destinationUrl: string;
  customCode?: string;
  title?: string | null;
  tags?: string[];
  /** Folder name; created in the workspace when it does not exist yet. */
  folder?: string | null;
}

export type ImportRowResult =
  | { row: number; status: "created"; code: string }
  | { row: number; status: "skipped"; code: string; reason: string }
  | { row: number; status: "failed"; reason: string; field?: string };

/** Domain errors carry a message meant for people; anything else is reported generically. */
function importFailure(row: number, error: unknown): ImportRowResult {
  if (error instanceof DomainError) {
    const field = typeof error.details?.["field"] === "string" ? error.details["field"] : undefined;
    return { row, status: "failed", reason: error.message, field };
  }
  return { row, status: "failed", reason: "Could not create this link" };
}

export interface RequestContext {
  ip: string | null;
  captchaToken?: string;
}

export interface CreatedLink {
  link: LinkDto;
  /** Only for anonymous links: lets the creator claim the link after signing up. */
  claimToken: string | null;
}

export interface ListLinksInput {
  scope?: "mine" | "all";
  search?: string;
  tag?: string;
  folder?: string;
  health?: "attention";
  status?: LinkStatusFilter;
  sort?: LinkSort;
  page?: number;
  pageSize?: number;
}

export interface LinkServiceDeps {
  links: ILinkRepository;
  clock: Clock;
  codes: CodeGenerator;
  hasher: PasswordHasher;
  abuse: AbuseService;
  settings: SettingsService;
  siteUrl: string;
  /** Server-side pepper for hashing creator IPs (abuse tracing). */
  ipPepper: string;
  /** Destination-check records; without it links carry no health information. */
  health?: ILinkHealthRepository;
  folders: IFolderRepository;
  /** Needed to check the actor's role in the workspace they move links to. */
  workspaces: Pick<IWorkspaceRepository, "getRole" | "findById">;
}

export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase());
}

export class LinkService {
  constructor(private readonly deps: LinkServiceDeps) {}

  private dto(link: Link, health: LinkHealth | null = null): LinkDto {
    return toLinkDto(link, this.deps.siteUrl, this.deps.clock.now(), health);
  }

  /** DTOs for a page of links, with their health records fetched in one query. */
  private async dtos(items: readonly Link[]): Promise<LinkDto[]> {
    const folderIds = [...new Set(items.flatMap((l) => (l.folderId ? [l.folderId] : [])))];
    const [records, folders] = await Promise.all([
      this.deps.health ? this.deps.health.findMany(items.map((l) => l.id)) : Promise.resolve([]),
      this.deps.folders.findManyByIds(folderIds),
    ]);
    const byLink = new Map(records.map((record) => [record.linkId, record]));
    const byFolder = new Map(folders.map((f) => [f.id, { id: f.id, name: f.name }]));
    return items.map((link) =>
      toLinkDto(
        link,
        this.deps.siteUrl,
        this.deps.clock.now(),
        byLink.get(link.id) ?? null,
        link.folderId ? (byFolder.get(link.folderId) ?? null) : null,
      ),
    );
  }

  /** A folder the new or edited link may be filed in: it must belong to the link's workspace. */
  private async assertFolder(workspaceId: string | null, folderId: string): Promise<void> {
    const folder = await this.deps.folders.findById(folderId);
    if (!folder || workspaceId === null || folder.workspaceId !== workspaceId) {
      throw new ValidationError("Folder not found", { field: "folderId" });
    }
  }

  /** The id of the workspace's folder with this name, created when it is new (imports). */
  private async folderIdForName(workspaceId: string, raw: string | null | undefined): Promise<string | null> {
    if (raw === null || raw === undefined) return null;
    const name = normalizeFolderName(raw);
    if (name === null) return null;
    const problem = folderNameProblem(name);
    if (problem) throw new ValidationError(problem, { field: "folder" });
    const existing = await this.deps.folders.findByName(workspaceId, name);
    if (existing) return existing.id;
    if ((await this.deps.folders.count(workspaceId)) >= LIMITS.foldersPerWorkspaceMax) {
      throw new ValidationError(`A workspace can have at most ${LIMITS.foldersPerWorkspaceMax} folders`, {
        field: "folder",
      });
    }
    try {
      return (await this.deps.folders.create(workspaceId, name)).id;
    } catch (error) {
      if (!(error instanceof UniqueViolationError)) throw error;
      const raced = await this.deps.folders.findByName(workspaceId, name);
      if (raced) return raced.id;
      throw error;
    }
  }

  async create(actor: Actor, cmd: CreateLinkCommand, ctx: RequestContext): Promise<CreatedLink> {
    const now = this.deps.clock.now();
    const anonymous = actor.kind === "anonymous";
    const settings = await this.deps.settings.get();

    if (anonymous) {
      if (!settings.allowAnonymousLinks) {
        throw new ValidationError("Anonymous link creation is disabled on this instance. Please sign in.");
      }
      if (cmd.password) throw new ValidationError("Sign in to create password-protected links");
      if (cmd.customCode) throw new ValidationError("Sign in to choose a custom short code");
      await this.deps.abuse.assertCaptcha(ctx.captchaToken, ctx.ip);
      await this.deps.abuse.enforceRateLimit(
        `create:anon:${ctx.ip ?? "unknown"}`,
        RATE_LIMITS.createLinkAnon,
      );
    } else if (actor.kind === "user") {
      requireLinkWriter(actor);
      if (actor.role !== "admin") {
        await this.deps.abuse.enforceRateLimit(`create:user:${actor.userId}`, RATE_LIMITS.createLinkUser);
      }
    }

    let expiresAt = resolveExpiresAt(cmd.expiration?.preset ?? "never", cmd.expiration?.customAt, now);
    if (anonymous) {
      expiresAt = earliest(expiresAt, new Date(now.getTime() + settings.anonLinkTtlHours * 3_600_000));
    }

    if (cmd.folderId) {
      if (anonymous) throw new ValidationError("Sign in to use folders");
      await this.assertFolder(actor.kind === "user" ? actor.workspace.id : null, cmd.folderId);
    }
    const { base, claimToken } = await this.buildLink(actor, cmd, expiresAt, ctx);
    const link = await this.insertWithCode(cmd.customCode, base);
    const [dto] = await this.dtos([link]);
    return { link: dto as LinkDto, claimToken };
  }

  /**
   * Creates the hidden link behind a bio page button. Same destination checks, code rules and
   * defaults as `create`, but exempt from the per-user creation limit: the bio service enforces its
   * own button limits, and a page of ten buttons must not eat the budget for ordinary links.
   */
  async createManaged(
    actor: Actor,
    cmd: Pick<CreateLinkCommand, "destinationUrl" | "title">,
    /** The person's personal workspace: bio pages are personal, whichever workspace is showing. */
    workspaceId: string,
  ): Promise<LinkDto> {
    const user = requireUser(actor);
    const { base } = await this.buildLink(actor, cmd, null, { ip: null });
    const link = await this.insertGenerated({
      ...base,
      userId: user.userId,
      workspaceId,
      kind: "bio_button",
    });
    return this.dto(link);
  }

  /**
   * Everything a new link needs except its code. Shared by `create` and `importLinks`, so imported
   * links get exactly the same destination checks, tag rules and defaults as links made in the form.
   * `assertDestination` lets a caller reuse verdicts (imports check each distinct URL once).
   */
  private async buildLink(
    actor: Actor,
    cmd: CreateLinkCommand,
    expiresAt: Date | null,
    ctx: RequestContext,
    assertDestination: (url: string) => Promise<void> = (url) =>
      this.deps.abuse.assertDestinationAllowed(url),
  ): Promise<{ base: Omit<NewLink, "code">; claimToken: string | null }> {
    const anonymous = actor.kind === "anonymous";
    const destinationUrl = cmd.destinationUrl.trim();
    await assertDestination(destinationUrl);
    this.assertOgImage(cmd.ogImageUrl);

    const claimToken = anonymous ? randomToken(24) : null;
    const base: Omit<NewLink, "code"> = {
      destinationUrl,
      userId: actor.kind === "user" ? actor.userId : null,
      workspaceId: actor.kind === "user" ? actor.workspace.id : null,
      title: cmd.title?.trim() || null,
      tags: this.cleanTags(cmd.tags),
      folderId: cmd.folderId ?? null,
      routingRules: await this.cleanRouting(cmd.routingRules, [], assertDestination),
      cardDesign: this.cleanCard(cmd.cardDesign),
      pixels: this.cleanPixels(cmd.pixels, Boolean(cmd.password)),
      passwordHash: cmd.password ? await this.deps.hasher.hash(cmd.password) : null,
      expiresAt,
      maxClicks: cmd.maxClicks ?? null,
      ogTitle: cmd.ogTitle?.trim() || null,
      ogDescription: cmd.ogDescription?.trim() || null,
      ogImageUrl: cmd.ogImageUrl?.trim() || null,
      ...this.cleanQr(cmd, { qrFgColor: DEFAULT_QR_FG, qrBgColor: DEFAULT_QR_BG, qrEcc: DEFAULT_QR_ECC }),
      createdIpHash: anonymous && ctx.ip ? sha256Hex(`${this.deps.ipPepper}:${ctx.ip}`) : null,
      claimTokenHash: claimToken ? sha256Hex(claimToken) : null,
    };
    return { base, claimToken };
  }

  private insertWithCode(customCode: string | undefined, base: Omit<NewLink, "code">): Promise<Link> {
    return customCode ? this.insertCustom(customCode, base) : this.insertGenerated(base);
  }

  /**
   * Creates up to `LIMITS.importBatchSize` links for the signed-in user. Rows are independent: a bad
   * row never rolls back the others, and the database unique constraint still decides code
   * collisions. Re-sending a row whose code already points at the same destination for the same user
   * is reported as `skipped`, so fixing a file and importing it again is safe.
   *
   * Spends one `importBatches` token per call instead of one `createLinkUser` token per row.
   */
  async importLinks(actor: Actor, rows: readonly ImportRowCommand[]): Promise<ImportRowResult[]> {
    const user = requireLinkWriter(actor);
    if (rows.length === 0) throw new ValidationError("There are no rows to import");
    if (rows.length > LIMITS.importBatchSize) {
      throw new ValidationError(`At most ${LIMITS.importBatchSize} rows can be imported per request`);
    }
    if (user.role !== "admin") {
      await this.deps.abuse.enforceRateLimit(`import:user:${user.userId}`, RATE_LIMITS.importBatches);
    }

    // One Safe Browsing / blocklist verdict per distinct URL in this batch.
    const verdicts = new Map<string, Promise<void>>();
    const assertDestination = (url: string) => {
      let verdict = verdicts.get(url);
      if (!verdict) {
        verdict = this.deps.abuse.assertDestinationAllowed(url);
        verdicts.set(url, verdict);
      }
      return verdict;
    };

    const results: ImportRowResult[] = [];
    for (const row of rows) {
      try {
        results.push(await this.importRow(actor, user.workspace.id, row, assertDestination));
      } catch (error) {
        results.push(importFailure(row.row, error));
      }
    }
    return results;
  }

  private async importRow(
    actor: Actor,
    workspaceId: string,
    row: ImportRowCommand,
    assertDestination: (url: string) => Promise<void>,
  ): Promise<ImportRowResult> {
    const destinationUrl = row.destinationUrl.trim();
    if (destinationUrl.length > LIMITS.urlMaxLength) {
      throw new ValidationError(`URLs can be at most ${LIMITS.urlMaxLength} characters`, { field: "url" });
    }
    if ((row.title ?? "").trim().length > LIMITS.titleMax) {
      throw new ValidationError(`Title is longer than ${LIMITS.titleMax} characters`, { field: "title" });
    }

    const customCode = row.customCode?.trim() || undefined;
    if (customCode) {
      const existing = await this.deps.links.findByCode(customCode);
      if (existing && existing.workspaceId === workspaceId && existing.destinationUrl === destinationUrl) {
        return { row: row.row, status: "skipped", code: existing.code, reason: "Already imported" };
      }
    }

    const folderId = await this.folderIdForName(workspaceId, row.folder);
    const { base } = await this.buildLink(
      actor,
      { destinationUrl, title: row.title, tags: row.tags, folderId },
      null,
      { ip: null },
      assertDestination,
    );
    const link = await this.insertWithCode(customCode, base);
    return { row: row.row, status: "created", code: link.code };
  }

  /**
   * For the import preview: which of these codes are unavailable. `existing` codes already point at
   * the same destination for this user (an import would skip them); `taken` ones belong to someone
   * else or to a deleted link, whose code stays reserved.
   */
  async checkImportCodes(
    actor: Actor,
    items: readonly { code: string; destinationUrl: string }[],
  ): Promise<{ taken: string[]; existing: string[] }> {
    const user = requireUser(actor);
    if (items.length > LIMITS.importMaxRows) {
      throw new ValidationError(`At most ${LIMITS.importMaxRows} rows can be checked at once`);
    }
    const holders = await this.deps.links.findCodeHolders([...new Set(items.map((item) => item.code))]);
    const holderOf = new Map(holders.map((holder) => [holder.code, holder]));
    const taken = new Set<string>();
    const existing = new Set<string>();
    for (const { code, destinationUrl } of items) {
      const holder = holderOf.get(code);
      if (!holder) continue;
      const mine =
        holder.deletedAt === null &&
        holder.workspaceId === user.workspace.id &&
        holder.destinationUrl === destinationUrl.trim();
      (mine ? existing : taken).add(code);
    }
    return { taken: [...taken], existing: [...existing] };
  }

  private async insertCustom(code: string, base: Omit<NewLink, "code">): Promise<Link> {
    if (!CUSTOM_CODE_PATTERN.test(code)) {
      throw new ValidationError("Custom codes must be 3-50 characters: letters, numbers, - or _", {
        field: "customCode",
      });
    }
    if (isReservedCode(code)) {
      throw new ValidationError("This code is reserved, please choose another", { field: "customCode" });
    }
    try {
      return await this.deps.links.create({ ...base, code });
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        throw new ConflictError("This short code is already taken", { field: "customCode" });
      }
      throw error;
    }
  }

  /**
   * Random code with retry on unique violation. The DB constraint is the
   * source of truth (no racy pre-check); after repeated collisions the code
   * grows by one character.
   */
  private async insertGenerated(base: Omit<NewLink, "code">): Promise<Link> {
    for (let growth = 0; growth <= CODE_MAX_LENGTH_GROWTH; growth++) {
      const length = CODE_DEFAULT_LENGTH + growth;
      for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS_PER_LENGTH; attempt++) {
        const code = this.deps.codes.generate(length);
        if (isReservedCode(code)) continue;
        try {
          return await this.deps.links.create({ ...base, code });
        } catch (error) {
          if (error instanceof UniqueViolationError) continue;
          throw error;
        }
      }
    }
    throw new Error("Could not generate a unique short code");
  }

  /** Normalizes and validates tags; the same rules apply to forms, the API and imports. */
  private cleanTags(raw: readonly string[] | undefined): string[] {
    const tags = normalizeTags(raw ?? []);
    if (tags.length > LIMITS.tagsPerLinkMax) {
      throw new ValidationError(`A link can have at most ${LIMITS.tagsPerLinkMax} tags`, { field: "tags" });
    }
    if (tags.some((tag) => !isValidTag(tag))) {
      throw new ValidationError(`Tags are up to ${LIMITS.tagMaxLength} letters, numbers, - or _`, {
        field: "tags",
      });
    }
    return tags;
  }

  /** Validates a card design from any caller (form, API) and returns the stored form; `null`/`undefined` mean none. */
  private cleanCard(raw: CardDesign | null | undefined): CardDesign | null {
    if (raw === null || raw === undefined) return null;
    const result = parseCardDesign(raw);
    if (!result.ok) throw new ValidationError(result.error, { field: "cardDesign" });
    return result.design;
  }

  /**
   * Normalizes smart-routing rules and checks every target like a primary destination (scheme,
   * blocklist, own host, Safe Browsing), so routing cannot be used to dodge those checks. On edits,
   * only targets that are new are checked again.
   */
  private async cleanRouting(
    raw: readonly RoutingRule[] | undefined,
    existing: readonly RoutingRule[],
    assertDestination: (url: string) => Promise<void> = (url) =>
      this.deps.abuse.assertDestinationAllowed(url),
  ): Promise<RoutingRule[]> {
    const rules: RoutingRule[] = (raw ?? []).map((rule) => {
      if (rule.platform !== undefined && !isRoutingPlatform(rule.platform)) {
        throw new ValidationError("Unknown device in a routing rule", { field: "routingRules" });
      }
      const countries = normalizeCountries(rule.countries ?? []);
      const variants = rule.variants?.map((v) => ({
        url: v.url.trim(),
        weight: v.weight,
        ...(v.label?.trim() ? { label: v.label.trim() } : {}),
      }));
      return {
        ...(rule.platform === undefined ? {} : { platform: rule.platform }),
        ...(countries.length > 0 ? { countries } : {}),
        // The first variant is the control, so `url` always agrees with it.
        url: variants?.[0]?.url ?? rule.url.trim(),
        ...(variants ? { variants } : {}),
      };
    });
    const problem = routingProblem(rules);
    if (problem) throw new ValidationError(problem, { field: "routingRules" });

    const checked = new Set(
      existing.flatMap((rule) => [rule.url, ...(rule.variants?.map((v) => v.url) ?? [])]),
    );
    for (const [index, rule] of rules.entries()) {
      for (const target of new Set([rule.url, ...(rule.variants?.map((v) => v.url) ?? [])])) {
        if (checked.has(target)) continue;
        checked.add(target);
        try {
          await assertDestination(target);
        } catch (error) {
          // Say which rule, so the form can show the message next to it.
          if (error instanceof ValidationError) {
            throw new ValidationError(`Rule ${index + 1}: ${error.message}`, { field: "routingRules" });
          }
          throw error;
        }
      }
    }
    return rules;
  }

  /**
   * Validates retargeting pixels. A password-protected link cannot carry them: the unlock form hands
   * the visitor straight to the destination, so the pixels would silently never run.
   */
  private cleanPixels(raw: LinkPixels | null | undefined, hasPassword: boolean): LinkPixels | null {
    const pixels = normalizePixels(raw);
    const problem = pixelsProblem(pixels);
    if (problem) throw new ValidationError(problem, { field: "pixels" });
    if (pixels && hasPassword) {
      throw new ValidationError("Retargeting pixels can't be used on a password-protected link", {
        field: "pixels",
      });
    }
    return pixels;
  }

  /**
   * QR options for a new or edited link. Creates fill gaps from `fallback`; edits (`partial`) only
   * return what the command sets. Colours must be scannable together, checked against the saved
   * colour when only one of them changes.
   */
  private cleanQr(
    cmd: Pick<CreateLinkCommand, "qrFgColor" | "qrBgColor" | "qrEcc" | "qrFrame" | "qrFrameText">,
    fallback: Pick<Link, "qrFgColor" | "qrBgColor"> & Partial<Pick<Link, "qrEcc">>,
    partial = false,
  ): Partial<Pick<Link, "qrFgColor" | "qrBgColor" | "qrEcc" | "qrFrame" | "qrFrameText">> {
    if (cmd.qrEcc !== undefined && !QR_ECC_LEVELS.includes(cmd.qrEcc)) {
      throw new ValidationError("Unknown QR error correction level", { field: "qrEcc" });
    }
    if (cmd.qrFrame !== undefined && !QR_FRAMES.includes(cmd.qrFrame)) {
      throw new ValidationError("Unknown QR frame", { field: "qrFrame" });
    }
    const fg = cmd.qrFgColor ?? fallback.qrFgColor;
    const bg = cmd.qrBgColor ?? fallback.qrBgColor;
    if ((cmd.qrFgColor !== undefined || cmd.qrBgColor !== undefined || !partial) && !isScannable(fg, bg)) {
      throw new ValidationError("QR colours are too similar to scan. Pick a darker foreground.", {
        field: "qrFgColor",
      });
    }
    const out: ReturnType<LinkService["cleanQr"]> = {};
    if (!partial || cmd.qrFgColor !== undefined) out.qrFgColor = fg;
    if (!partial || cmd.qrBgColor !== undefined) out.qrBgColor = bg;
    if (cmd.qrEcc !== undefined) out.qrEcc = cmd.qrEcc;
    else if (!partial) out.qrEcc = fallback.qrEcc ?? DEFAULT_QR_ECC;
    if (cmd.qrFrame !== undefined) out.qrFrame = cmd.qrFrame;
    else if (!partial) out.qrFrame = "none";
    if (cmd.qrFrameText !== undefined) out.qrFrameText = normalizeFrameText(cmd.qrFrameText);
    else if (!partial) out.qrFrameText = null;
    return out;
  }

  private assertOgImage(url: string | null | undefined) {
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError("OG image must be a valid https:// URL", { field: "ogImageUrl" });
    }
    if (parsed.protocol !== "https:") {
      throw new ValidationError("OG image must be an https:// URL", { field: "ogImageUrl" });
    }
  }

  /** The link, if the actor may use it for `permission` (read-only things like analytics ask for `link:read`). */
  async getOwned(actor: Actor, id: string, permission: Permission = "link:write"): Promise<Link> {
    const link = await this.deps.links.findById(id);
    if (!link) throw new NotFoundError("Link not found");
    assertCanManageLink(actor, link, permission);
    return link;
  }

  async get(actor: Actor, id: string): Promise<LinkDto> {
    const [dto] = await this.dtos([await this.getOwned(actor, id, "link:read")]);
    return dto as LinkDto;
  }

  async update(actor: Actor, id: string, cmd: UpdateLinkCommand): Promise<LinkDto> {
    const link = await this.getOwned(actor, id);
    const now = this.deps.clock.now();
    const patch: LinkPatch = {};

    if (cmd.destinationUrl !== undefined && cmd.destinationUrl.trim() !== link.destinationUrl) {
      const destinationUrl = cmd.destinationUrl.trim();
      await this.deps.abuse.assertDestinationAllowed(destinationUrl);
      patch.destinationUrl = destinationUrl;
    }
    if (cmd.title !== undefined) patch.title = cmd.title?.trim() || null;
    if (cmd.tags !== undefined) patch.tags = this.cleanTags(cmd.tags);
    if (cmd.folderId !== undefined) {
      if (cmd.folderId !== null) await this.assertFolder(link.workspaceId, cmd.folderId);
      patch.folderId = cmd.folderId;
    }
    if (cmd.cardDesign !== undefined) patch.cardDesign = this.cleanCard(cmd.cardDesign);
    // Pixels and a password exclude each other, so check the result of this edit, not just the new field.
    const willHavePassword = cmd.password === undefined ? link.passwordHash !== null : cmd.password !== null;
    if (cmd.pixels !== undefined) {
      patch.pixels = this.cleanPixels(cmd.pixels, willHavePassword);
    } else if (cmd.password && link.pixels) {
      throw new ValidationError("Remove the retargeting pixels before adding a password", {
        field: "password",
      });
    }
    if (cmd.routingRules !== undefined) {
      patch.routingRules = await this.cleanRouting(cmd.routingRules, link.routingRules);
    }
    if (cmd.expiration !== undefined) {
      patch.expiresAt = resolveExpiresAt(cmd.expiration.preset, cmd.expiration.customAt, now);
    }
    if (cmd.maxClicks !== undefined) patch.maxClicks = cmd.maxClicks;
    if (cmd.conversionsEnabled !== undefined) patch.conversionsEnabled = cmd.conversionsEnabled;
    if (cmd.publicStats !== undefined) {
      patch.statsToken = cmd.publicStats ? (link.statsToken ?? randomToken(16)) : null;
    }
    if (cmd.password !== undefined) {
      patch.passwordHash = cmd.password === null ? null : await this.deps.hasher.hash(cmd.password);
    }
    if (cmd.isEnabled !== undefined) patch.isEnabled = cmd.isEnabled;
    if (cmd.ogTitle !== undefined) patch.ogTitle = cmd.ogTitle?.trim() || null;
    if (cmd.ogDescription !== undefined) patch.ogDescription = cmd.ogDescription?.trim() || null;
    if (cmd.ogImageUrl !== undefined) {
      this.assertOgImage(cmd.ogImageUrl);
      patch.ogImageUrl = cmd.ogImageUrl?.trim() || null;
    }
    Object.assign(patch, this.cleanQr(cmd, link, true));

    const updated = await this.deps.links.update(link.id, patch);
    if (!updated) throw new NotFoundError("Link not found");
    // Earlier health results describe the old targets, so they start over.
    if (patch.destinationUrl !== undefined || patch.routingRules !== undefined) {
      await this.deps.health?.delete(link.id);
    }
    const [dto] = await this.dtos([updated]);
    return dto as LinkDto;
  }

  /**
   * The opt-in public stats page. `enable` keeps an existing address, `rotate` replaces it (the old one
   * stops working at once), `disable` removes it.
   */
  async setPublicStats(actor: Actor, id: string, mode: "enable" | "rotate" | "disable"): Promise<LinkDto> {
    const link = await this.getOwned(actor, id);
    if (link.kind !== "link") throw new ValidationError("This link has no stats page");
    const statsToken =
      mode === "disable" ? null : mode === "enable" && link.statsToken ? link.statsToken : randomToken(16);
    const updated = await this.deps.links.update(link.id, { statsToken });
    if (!updated) throw new NotFoundError("Link not found");
    return this.dto(updated);
  }

  /** Public lookup by stats token, for the stats page. No authorization: the token is the capability. */
  async findByStatsToken(token: string): Promise<Link | null> {
    return this.deps.links.findByStatsToken(token);
  }

  private async loadAllOwned(actor: Actor, ids: readonly string[]): Promise<Link[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) throw new ValidationError("Select at least one link");
    if (unique.length > 500) throw new ValidationError("At most 500 links can be changed at once");
    const found = await Promise.all(unique.map((id) => this.deps.links.findById(id)));
    return found.map((link) => {
      if (!link) throw new NotFoundError("Link not found");
      assertCanManageLink(actor, link);
      return link;
    });
  }

  /** Files links in a folder of their workspace, or takes them out of any folder (`folderId = null`). */
  async moveToFolder(actor: Actor, ids: readonly string[], folderId: string | null): Promise<number> {
    const owned = await this.loadAllOwned(actor, ids);
    if (folderId !== null) {
      const folder = await this.deps.folders.findById(folderId);
      if (!folder) throw new ValidationError("Folder not found", { field: "folderId" });
      if (owned.some((link) => link.workspaceId !== folder.workspaceId)) {
        throw new ValidationError("Links can only be filed in a folder of their own workspace", {
          field: "folderId",
        });
      }
    }
    return this.deps.links.setFolder(
      owned.map((l) => l.id),
      folderId,
    );
  }

  /**
   * Moves links to another workspace. The actor must be an owner or admin of **both** workspaces (instance admins
   * excepted); viewers and editors cannot, and neither can someone who is not a member of the target. The links
   * keep their codes, clicks, stats address and health; they leave their folder (folders belong to a workspace).
   * API keys of the old workspace stop seeing them. Bio-page buttons cannot be moved.
   */
  async moveToWorkspace(actor: Actor, ids: readonly string[], targetWorkspaceId: string): Promise<number> {
    const user = requireUser(actor);
    const unique = [...new Set(ids)];
    if (unique.length === 0) throw new ValidationError("Select at least one link");
    if (unique.length > LIMITS.moveLinksMax) {
      throw new ValidationError(`At most ${LIMITS.moveLinksMax} links can be moved at once`);
    }
    const owned = await this.loadAllOwned(actor, unique);
    if (owned.some((link) => link.kind !== "link")) {
      throw new ValidationError("Bio page buttons cannot be moved");
    }
    const sources = new Set(owned.map((link) => link.workspaceId));
    const [source] = [...sources];
    if (sources.size !== 1 || !source) {
      throw new ValidationError("Links can only be moved from one workspace at a time");
    }
    if (source === targetWorkspaceId) throw new ValidationError("The links are already in that workspace");
    if (!(await this.deps.workspaces.findById(targetWorkspaceId))) {
      throw new ValidationError("Workspace not found", { field: "workspaceId" });
    }

    if (user.role !== "admin") {
      const mayManage = (role: string | null) => role === "owner" || role === "admin";
      const [fromRole, toRole] = await Promise.all([
        this.deps.workspaces.getRole(source, user.userId),
        this.deps.workspaces.getRole(targetWorkspaceId, user.userId),
      ]);
      if (!mayManage(fromRole) || !mayManage(toRole)) {
        throw new ForbiddenError(
          "You need to be an owner or admin of both workspaces to move links between them",
        );
      }
    }
    const moved = await this.deps.links.moveToWorkspace(
      owned.map((l) => l.id),
      source,
      targetWorkspaceId,
    );
    return moved;
  }

  async delete(actor: Actor, ids: readonly string[]): Promise<number> {
    const owned = await this.loadAllOwned(actor, ids);
    return this.deps.links.softDelete(
      owned.map((l) => l.id),
      this.deps.clock.now(),
    );
  }

  async setEnabled(actor: Actor, ids: readonly string[], enabled: boolean): Promise<number> {
    const owned = await this.loadAllOwned(actor, ids);
    return this.deps.links.setEnabled(
      owned.map((l) => l.id),
      enabled,
    );
  }

  async list(actor: Actor, input: ListLinksInput): Promise<Page<LinkDto>> {
    const user = requireUser(actor);
    const all = input.scope === "all" && isAdmin(actor);
    const page = await this.deps.links.list({
      workspaceId: all ? undefined : user.workspace.id,
      kind: all ? "any" : "link",
      search: input.search,
      tag: input.tag ? normalizeTag(input.tag) : undefined,
      folder: input.folder,
      health: input.health,
      status: input.status ?? "all",
      sort: input.sort ?? "created_desc",
      page: Math.max(1, input.page ?? 1),
      pageSize: Math.min(100, Math.max(1, input.pageSize ?? 20)),
      now: this.deps.clock.now(),
    });
    return { ...page, items: await this.dtos(page.items) };
  }

  /** Tags in use, for the dashboard filter. Admins listing every link see every tag. */
  async listTags(actor: Actor, scope: "mine" | "all" = "mine"): Promise<string[]> {
    const user = requireUser(actor);
    return this.deps.links.listTags(scope === "all" && isAdmin(actor) ? undefined : user.workspace.id);
  }

  async listByCursor(
    actor: Actor,
    cursor: string | null,
    limit: number,
    filter: { tag?: string; folder?: string } = {},
  ): Promise<{ items: LinkDto[]; nextCursor: string | null }> {
    const user = requireUser(actor);
    const page = await this.deps.links.listByCursor(
      user.workspace.id,
      cursor,
      Math.min(100, Math.max(1, limit)),
      { tag: filter.tag ? normalizeTag(filter.tag) : undefined, folder: filter.folder },
    );
    return { items: await this.dtos(page.items), nextCursor: page.nextCursor };
  }

  /** Moves anonymous links into the signed-in user's account using their claim tokens. */
  async claim(actor: Actor, tokens: readonly string[]): Promise<number> {
    const user = requireUser(actor);
    const hashes = [...new Set(tokens.filter((t) => t.length >= 16 && t.length <= 64))]
      .slice(0, 100)
      .map(sha256Hex);
    const claimable = await this.deps.links.findByClaimTokenHashes(hashes);
    return this.deps.links.claim(
      claimable.map((l) => l.id),
      user.userId,
      user.workspace.id,
    );
  }

  async exportForUser(actor: Actor): Promise<LinkDto[]> {
    const user = requireUser(actor);
    const links = await this.deps.links.listAllByUser(user.userId);
    return links.map((l) => this.dto(l));
  }

  async overview(actor: Actor) {
    const user = requireUser(actor);
    return this.deps.links.overview(user.workspace.id, this.deps.clock.now());
  }
}
