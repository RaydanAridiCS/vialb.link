import {
  handleProblem,
  isSocialPlatform,
  normalizeHandle,
  normalizeSocialUrl,
  type SocialLink,
} from "@/lib/bio";
import { LIMITS, RATE_LIMITS } from "@/lib/constants";
import { isPaletteKey, type PaletteKey } from "@/lib/palettes";
import type { Actor, BioButton, BioProfile } from "@/server/domain/types";
import { ConflictError, NotFoundError, UniqueViolationError, ValidationError } from "@/server/errors";
import type { Clock } from "@/server/ports/clock";
import type { IBioRepository } from "@/server/repositories/bio.repository";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";
import type { AbuseService } from "./abuse.service";
import { isAdmin, requireUser } from "./authorization";
import { linkStatus, toLinkDto, type LinkDto } from "./dto";
import type { LinkService } from "./link.service";

export interface SaveBioProfileCommand {
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  theme: PaletteKey;
  /** What the owner typed per platform; normalized and validated here. */
  socials: readonly { platform: string; value: string }[];
  showBadge: boolean;
  isPublished: boolean;
}

export interface AddBioButtonCommand {
  label: string;
  url: string;
}

export interface UpdateBioButtonCommand {
  label?: string;
  url?: string;
  isVisible?: boolean;
}

export interface BioProfileDto {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  theme: PaletteKey;
  socials: SocialLink[];
  showBadge: boolean;
  isPublished: boolean;
  /** Absolute URL of the public page. */
  pageUrl: string;
}

export interface BioButtonDto {
  id: string;
  label: string;
  isVisible: boolean;
  position: number;
  link: Pick<LinkDto, "id" | "code" | "shortUrl" | "destinationUrl" | "clickCount" | "status">;
}

export interface BioEditorDto {
  profile: BioProfileDto | null;
  buttons: BioButtonDto[];
}

/** What a visitor of `/@handle` gets: no ids, no destinations, only where to click. */
export interface BioPageDto {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  theme: PaletteKey;
  socials: SocialLink[];
  showBadge: boolean;
  buttons: { id: string; label: string; href: string }[];
}

export interface HandleCheck {
  available: boolean;
  /** Why not, in words for the owner. */
  reason?: string;
}

export interface BioServiceDeps {
  bio: IBioRepository;
  links: LinkService;
  linkRepo: ILinkRepository;
  users: IUserRepository;
  abuse: AbuseService;
  clock: Clock;
  siteUrl: string;
}

function cleanText(raw: string | null | undefined, max: number, field: string, what: string): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if ([...value].length > max)
    throw new ValidationError(`${what} can be at most ${max} characters`, { field });
  return value;
}

export class BioService {
  constructor(private readonly deps: BioServiceDeps) {}

  private pageUrl(handle: string): string {
    return `${this.deps.siteUrl}/@${handle}`;
  }

  private profileDto(profile: BioProfile): BioProfileDto {
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      theme: profile.theme,
      socials: profile.socials,
      showBadge: profile.showBadge,
      isPublished: profile.isPublished,
      pageUrl: this.pageUrl(profile.handle),
    };
  }

  /** The signed-in user's page and buttons, for the dashboard editor. */
  async getEditor(actor: Actor): Promise<BioEditorDto> {
    const user = requireUser(actor);
    const profile = await this.deps.bio.findProfileByUserId(user.userId);
    if (!profile) return { profile: null, buttons: [] };

    const buttons = await this.deps.bio.listButtons(user.userId);
    const links = await this.deps.linkRepo.findManyByIds(buttons.map((b) => b.linkId));
    const byId = new Map(links.map((link) => [link.id, link]));
    const now = this.deps.clock.now();
    return {
      profile: this.profileDto(profile),
      buttons: buttons.flatMap((button): BioButtonDto[] => {
        const link = byId.get(button.linkId);
        if (!link) return [];
        const dto = toLinkDto(link, this.deps.siteUrl, now);
        return [
          {
            id: button.id,
            label: button.label,
            isVisible: button.isVisible,
            position: button.position,
            link: {
              id: dto.id,
              code: dto.code,
              shortUrl: dto.shortUrl,
              destinationUrl: dto.destinationUrl,
              clickCount: dto.clickCount,
              status: dto.status,
            },
          },
        ];
      }),
    };
  }

  async checkHandle(actor: Actor, raw: string): Promise<HandleCheck> {
    const user = requireUser(actor);
    const handle = normalizeHandle(raw);
    const problem = handleProblem(handle);
    if (problem) return { available: false, reason: problem };
    const holder = await this.deps.bio.findProfileByHandle(handle);
    if (holder && holder.userId !== user.userId) return { available: false, reason: "This handle is taken" };
    return { available: true };
  }

  async saveProfile(actor: Actor, cmd: SaveBioProfileCommand): Promise<BioProfileDto> {
    const user = requireUser(actor);
    const existing = await this.deps.bio.findProfileByUserId(user.userId);

    const handle = normalizeHandle(cmd.handle);
    const problem = handleProblem(handle);
    if (problem) throw new ValidationError(problem, { field: "handle" });
    const handleChanged = !existing || existing.handle !== handle;
    if (handleChanged) {
      const holder = await this.deps.bio.findProfileByHandle(handle);
      if (holder && holder.userId !== user.userId) {
        throw new ConflictError("This handle is taken", { field: "handle" });
      }
    }

    if (!isPaletteKey(cmd.theme)) throw new ValidationError("Unknown theme", { field: "theme" });
    const avatarUrl = this.cleanAvatar(cmd.avatarUrl);
    const socials = await this.cleanSocials(cmd.socials);
    const displayName = cleanText(cmd.displayName, LIMITS.bioDisplayNameMax, "displayName", "The name");
    const bio = cleanText(cmd.bio, LIMITS.bioTextMax, "bio", "The bio");

    // Only a save that is otherwise valid spends the handle budget, so typos elsewhere never lock anyone out.
    if (handleChanged && !isAdmin(actor)) {
      await this.deps.abuse.enforceRateLimit(`bio:handle:${user.userId}`, RATE_LIMITS.bioHandle);
    }

    try {
      const saved = await this.deps.bio.saveProfile({
        userId: user.userId,
        handle,
        displayName,
        bio,
        avatarUrl,
        theme: cmd.theme,
        socials,
        showBadge: cmd.showBadge,
        isPublished: cmd.isPublished,
      });
      return this.profileDto(saved);
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        throw new ConflictError("This handle is taken", { field: "handle" });
      }
      throw error;
    }
  }

  private cleanAvatar(raw: string | null | undefined): string | null {
    const value = raw?.trim();
    if (!value) return null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ValidationError("The picture must be a valid https:// link", { field: "avatarUrl" });
    }
    if (url.protocol !== "https:" || value.length > LIMITS.urlMaxLength || url.username || url.password) {
      throw new ValidationError("The picture must be a plain https:// link", { field: "avatarUrl" });
    }
    return url.toString();
  }

  private async cleanSocials(raw: SaveBioProfileCommand["socials"]): Promise<SocialLink[]> {
    if (raw.length > LIMITS.bioSocialsMax) {
      throw new ValidationError(`A page can have at most ${LIMITS.bioSocialsMax} social links`, {
        field: "socials",
      });
    }
    const socials: SocialLink[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!isSocialPlatform(item.platform)) {
        throw new ValidationError("Unknown social platform", { field: "socials" });
      }
      const result = normalizeSocialUrl(item.platform, item.value);
      if (!result.ok) throw new ValidationError(result.error, { field: "socials" });
      const key = `${item.platform}:${result.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A personal website is the one free-form link, so it gets the same checks as any destination.
      if (item.platform === "website") await this.deps.abuse.assertDestinationAllowed(result.url);
      socials.push({ platform: item.platform, url: result.url });
    }
    return socials;
  }

  async addButton(actor: Actor, cmd: AddBioButtonCommand): Promise<BioButtonDto> {
    const user = requireUser(actor);
    if (!(await this.deps.bio.findProfileByUserId(user.userId))) {
      throw new ValidationError("Create your page first, then add buttons");
    }
    const label = this.cleanLabel(cmd.label);
    const existing = await this.deps.bio.listButtons(user.userId);
    if (existing.length >= LIMITS.bioButtonsMax) {
      throw new ValidationError(`A page can have at most ${LIMITS.bioButtonsMax} buttons`);
    }
    if (!isAdmin(actor))
      await this.deps.abuse.enforceRateLimit(`bio:buttons:${user.userId}`, RATE_LIMITS.bioButtons);

    const link = await this.deps.links.createManaged(actor, { destinationUrl: cmd.url, title: label });
    let button: BioButton;
    try {
      button = await this.deps.bio.addButton({ userId: user.userId, linkId: link.id, label });
    } catch (error) {
      await this.deps.links.delete(actor, [link.id]);
      throw error;
    }
    return this.buttonDto(button, link);
  }

  async updateButton(actor: Actor, id: string, cmd: UpdateBioButtonCommand): Promise<BioButtonDto> {
    const button = await this.ownedButton(actor, id);
    const label = cmd.label === undefined ? undefined : this.cleanLabel(cmd.label);

    let link: LinkDto;
    if (cmd.url !== undefined || label !== undefined) {
      // `LinkService.update` re-checks the destination only when it actually changed.
      link = await this.deps.links.update(actor, button.linkId, {
        destinationUrl: cmd.url,
        title: label,
      });
    } else {
      link = await this.deps.links.get(actor, button.linkId);
    }
    const updated = await this.deps.bio.updateButton(button.id, {
      ...(label === undefined ? {} : { label }),
      ...(cmd.isVisible === undefined ? {} : { isVisible: cmd.isVisible }),
    });
    if (!updated) throw new NotFoundError("Button not found");
    return this.buttonDto(updated, link);
  }

  async removeButton(actor: Actor, id: string): Promise<void> {
    const button = await this.ownedButton(actor, id);
    await this.deps.bio.deleteButton(button.id);
    await this.deps.links.delete(actor, [button.linkId]);
  }

  /** `orderedIds` must be exactly the user's buttons, in the new order. */
  async reorderButtons(actor: Actor, orderedIds: readonly string[]): Promise<void> {
    const user = requireUser(actor);
    const mine = await this.deps.bio.listButtons(user.userId);
    const wanted = new Set(orderedIds);
    if (
      wanted.size !== orderedIds.length ||
      orderedIds.length !== mine.length ||
      mine.some((button) => !wanted.has(button.id))
    ) {
      throw new ValidationError("The order does not match your buttons. Reload the page and try again.");
    }
    await this.deps.bio.reorderButtons(user.userId, orderedIds);
  }

  /** Deletes the page and every button's hidden link. The handle becomes available again. */
  async deletePage(actor: Actor): Promise<void> {
    const user = requireUser(actor);
    const removed = await this.deps.bio.deleteProfile(user.userId);
    if (removed.length > 0) {
      await this.deps.links.delete(
        actor,
        removed.map((button) => button.linkId),
      );
    }
  }

  /**
   * The public page for `/@handle`, or `null` when there is nothing to show: unknown, unpublished or
   * belonging to a banned account. Buttons whose link is disabled, expired or out of visits are left out.
   */
  async getPublic(rawHandle: string): Promise<BioPageDto | null> {
    const handle = normalizeHandle(rawHandle);
    if (handleProblem(handle)) return null;
    const profile = await this.deps.bio.findProfileByHandle(handle);
    if (!profile?.isPublished) return null;
    const owner = await this.deps.users.findById(profile.userId);
    if (!owner || owner.banned) return null;

    const buttons = (await this.deps.bio.listButtons(profile.userId)).filter((b) => b.isVisible);
    const links = await this.deps.linkRepo.findManyByIds(buttons.map((b) => b.linkId));
    const byId = new Map(links.map((link) => [link.id, link]));
    const now = this.deps.clock.now();
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      theme: profile.theme,
      socials: profile.socials,
      showBadge: profile.showBadge,
      buttons: buttons.flatMap((button) => {
        const link = byId.get(button.linkId);
        if (!link || linkStatus(link, now) !== "active") return [];
        return [{ id: button.id, label: button.label, href: `/${encodeURIComponent(link.code)}` }];
      }),
    };
  }

  private cleanLabel(raw: string): string {
    const label = raw.trim();
    if (!label) throw new ValidationError("Give the button a label", { field: "label" });
    if ([...label].length > LIMITS.bioButtonLabelMax) {
      throw new ValidationError(`Labels can be at most ${LIMITS.bioButtonLabelMax} characters`, {
        field: "label",
      });
    }
    return label;
  }

  /** Buttons are private to their owner; another user's id looks like a missing one. */
  private async ownedButton(actor: Actor, id: string): Promise<BioButton> {
    const user = requireUser(actor);
    const button = await this.deps.bio.findButton(id);
    if (!button || button.userId !== user.userId) throw new NotFoundError("Button not found");
    return button;
  }

  private buttonDto(button: BioButton, link: LinkDto): BioButtonDto {
    return {
      id: button.id,
      label: button.label,
      isVisible: button.isVisible,
      position: button.position,
      link: {
        id: link.id,
        code: link.code,
        shortUrl: link.shortUrl,
        destinationUrl: link.destinationUrl,
        clickCount: link.clickCount,
        status: link.status,
      },
    };
  }
}
