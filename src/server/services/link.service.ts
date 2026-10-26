import {
  CODE_DEFAULT_LENGTH,
  CODE_MAX_ATTEMPTS_PER_LENGTH,
  CODE_MAX_LENGTH_GROWTH,
  CUSTOM_CODE_PATTERN,
  LIMITS,
  RATE_LIMITS,
  RESERVED_CODES,
  type ExpirationPreset,
} from "@/lib/constants";
import type {
  Actor,
  Link,
  LinkPatch,
  LinkSort,
  LinkStatusFilter,
  NewLink,
  Page,
} from "@/server/domain/types";
import { ConflictError, NotFoundError, UniqueViolationError, ValidationError } from "@/server/errors";
import { isValidTag, normalizeTag, normalizeTags } from "@/lib/tags";
import { earliest, resolveExpiresAt } from "@/server/lib/expiry";
import { randomToken, sha256Hex } from "@/server/lib/hashing";
import type { Clock } from "@/server/ports/clock";
import type { CodeGenerator } from "@/server/ports/code-generator";
import type { PasswordHasher } from "@/server/ports/password-hasher";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import type { AbuseService } from "./abuse.service";
import { assertCanManageLink, isAdmin, requireUser } from "./authorization";
import { toLinkDto, type LinkDto } from "./dto";
import type { SettingsService } from "./settings.service";

export interface ExpirationInput {
  preset: ExpirationPreset;
  customAt?: Date | null;
}

export interface CreateLinkCommand {
  destinationUrl: string;
  customCode?: string;
  title?: string | null;
  tags?: string[];
  expiration?: ExpirationInput;
  maxClicks?: number | null;
  password?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  qrFgColor?: string;
  qrBgColor?: string;
}

export interface UpdateLinkCommand {
  destinationUrl?: string;
  title?: string | null;
  /** `undefined` keeps the current tags; an array replaces them. */
  tags?: string[];
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
}

export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase());
}

export class LinkService {
  constructor(private readonly deps: LinkServiceDeps) {}

  private dto(link: Link): LinkDto {
    return toLinkDto(link, this.deps.siteUrl, this.deps.clock.now());
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
    } else if (actor.kind === "user" && actor.role !== "admin") {
      await this.deps.abuse.enforceRateLimit(`create:user:${actor.userId}`, RATE_LIMITS.createLinkUser);
    }

    const destinationUrl = cmd.destinationUrl.trim();
    await this.deps.abuse.assertDestinationAllowed(destinationUrl);
    this.assertOgImage(cmd.ogImageUrl);

    let expiresAt = resolveExpiresAt(cmd.expiration?.preset ?? "never", cmd.expiration?.customAt, now);
    if (anonymous) {
      expiresAt = earliest(expiresAt, new Date(now.getTime() + settings.anonLinkTtlHours * 3_600_000));
    }

    const claimToken = anonymous ? randomToken(24) : null;
    const base: Omit<NewLink, "code"> = {
      destinationUrl,
      userId: actor.kind === "user" ? actor.userId : null,
      title: cmd.title?.trim() || null,
      tags: this.cleanTags(cmd.tags),
      passwordHash: cmd.password ? await this.deps.hasher.hash(cmd.password) : null,
      expiresAt,
      maxClicks: cmd.maxClicks ?? null,
      ogTitle: cmd.ogTitle?.trim() || null,
      ogDescription: cmd.ogDescription?.trim() || null,
      ogImageUrl: cmd.ogImageUrl?.trim() || null,
      qrFgColor: cmd.qrFgColor ?? "#000000",
      qrBgColor: cmd.qrBgColor ?? "#FFFFFF",
      createdIpHash: anonymous && ctx.ip ? sha256Hex(`${this.deps.ipPepper}:${ctx.ip}`) : null,
      claimTokenHash: claimToken ? sha256Hex(claimToken) : null,
    };

    const link = cmd.customCode
      ? await this.insertCustom(cmd.customCode, base)
      : await this.insertGenerated(base);
    return { link: this.dto(link), claimToken };
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

  async getOwned(actor: Actor, id: string): Promise<Link> {
    const link = await this.deps.links.findById(id);
    if (!link) throw new NotFoundError("Link not found");
    assertCanManageLink(actor, link);
    return link;
  }

  async get(actor: Actor, id: string): Promise<LinkDto> {
    return this.dto(await this.getOwned(actor, id));
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
    if (cmd.expiration !== undefined) {
      patch.expiresAt = resolveExpiresAt(cmd.expiration.preset, cmd.expiration.customAt, now);
    }
    if (cmd.maxClicks !== undefined) patch.maxClicks = cmd.maxClicks;
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
    if (cmd.qrFgColor !== undefined) patch.qrFgColor = cmd.qrFgColor;
    if (cmd.qrBgColor !== undefined) patch.qrBgColor = cmd.qrBgColor;

    const updated = await this.deps.links.update(link.id, patch);
    if (!updated) throw new NotFoundError("Link not found");
    return this.dto(updated);
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
      userId: all ? undefined : user.userId,
      search: input.search,
      tag: input.tag ? normalizeTag(input.tag) : undefined,
      status: input.status ?? "all",
      sort: input.sort ?? "created_desc",
      page: Math.max(1, input.page ?? 1),
      pageSize: Math.min(100, Math.max(1, input.pageSize ?? 20)),
      now: this.deps.clock.now(),
    });
    return { ...page, items: page.items.map((l) => this.dto(l)) };
  }

  /** Tags in use, for the dashboard filter. Admins listing every link see every tag. */
  async listTags(actor: Actor, scope: "mine" | "all" = "mine"): Promise<string[]> {
    const user = requireUser(actor);
    return this.deps.links.listTags(scope === "all" && isAdmin(actor) ? undefined : user.userId);
  }

  async listByCursor(
    actor: Actor,
    cursor: string | null,
    limit: number,
  ): Promise<{ items: LinkDto[]; nextCursor: string | null }> {
    const user = requireUser(actor);
    const page = await this.deps.links.listByCursor(user.userId, cursor, Math.min(100, Math.max(1, limit)));
    return { items: page.items.map((l) => this.dto(l)), nextCursor: page.nextCursor };
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
    );
  }

  async exportForUser(actor: Actor): Promise<LinkDto[]> {
    const user = requireUser(actor);
    const links = await this.deps.links.listAllByUser(user.userId);
    return links.map((l) => this.dto(l));
  }

  async overview(actor: Actor) {
    const user = requireUser(actor);
    return this.deps.links.overview(user.userId, this.deps.clock.now());
  }
}
