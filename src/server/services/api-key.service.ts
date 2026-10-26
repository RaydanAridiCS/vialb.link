import { API_KEY_PREFIX, LIMITS } from "@/lib/constants";
import type { Actor, Role } from "@/server/domain/types";
import { NotFoundError, UniqueViolationError, ValidationError } from "@/server/errors";
import { randomToken, safeEqualHex, sha256Hex } from "@/server/lib/hashing";
import type { Clock } from "@/server/ports/clock";
import type { IApiKeyRepository } from "@/server/repositories/api-key.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";
import type { IWorkspaceRepository } from "@/server/repositories/workspace.repository";
import { requireUser } from "./authorization";
import { toApiKeyDto, type ApiKeyDto } from "./dto";

/** Visible prefix length: "tw_" + 8 random characters. */
const PREFIX_LENGTH = API_KEY_PREFIX.length + 8;
const TOUCH_INTERVAL_MS = 60_000;

export interface ApiPrincipal {
  actor: Extract<Actor, { kind: "user" }>;
  keyId: string;
}

/**
 * API keys are 256-bit random secrets shown once. Only a sha256 hash and a
 * short prefix (for lookup / display) are stored. A slow KDF isn't needed
 * because the secret has full entropy and can't be brute-forced.
 */
export class ApiKeyService {
  constructor(
    private readonly deps: {
      apiKeys: IApiKeyRepository;
      users: IUserRepository;
      workspaces: Pick<IWorkspaceRepository, "getRole">;
      clock: Clock;
    },
  ) {}

  async create(actor: Actor, name: string): Promise<{ key: ApiKeyDto; secret: string }> {
    const user = requireUser(actor);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > LIMITS.apiKeyNameMax) {
      throw new ValidationError(`Name must be 1-${LIMITS.apiKeyNameMax} characters`, { field: "name" });
    }
    const existing = await this.deps.apiKeys.listByUser(user.userId);
    if (existing.filter((k) => !k.revokedAt).length >= 25) {
      throw new ValidationError("You can have at most 25 active API keys");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const secret = `${API_KEY_PREFIX}${randomToken(32)}`;
      try {
        const key = await this.deps.apiKeys.create({
          userId: user.userId,
          workspaceId: user.workspace.id,
          name: trimmed,
          prefix: secret.slice(0, PREFIX_LENGTH),
          hash: sha256Hex(secret),
        });
        return { key: toApiKeyDto(key), secret };
      } catch (error) {
        if (!(error instanceof UniqueViolationError)) throw error;
      }
    }
    throw new Error("Could not generate a unique API key");
  }

  /** The keys that act in the workspace the person is looking at. */
  async list(actor: Actor): Promise<ApiKeyDto[]> {
    const user = requireUser(actor);
    return (await this.deps.apiKeys.listByUser(user.userId, user.workspace.id)).map(toApiKeyDto);
  }

  /** Every key the person has, whichever workspace it acts in (data export). */
  async listAll(actor: Actor): Promise<ApiKeyDto[]> {
    const user = requireUser(actor);
    return (await this.deps.apiKeys.listByUser(user.userId)).map(toApiKeyDto);
  }

  async revoke(actor: Actor, id: string): Promise<void> {
    const user = requireUser(actor);
    const revoked = await this.deps.apiKeys.revoke(id, user.userId, this.deps.clock.now());
    if (!revoked) throw new NotFoundError("API key not found");
  }

  /** Resolves a bearer token to its owner, or `null` if invalid/revoked/banned. */
  async authenticate(secret: string): Promise<ApiPrincipal | null> {
    if (!secret.startsWith(API_KEY_PREFIX) || secret.length < PREFIX_LENGTH + 16 || secret.length > 200)
      return null;
    const key = await this.deps.apiKeys.findActiveByPrefix(secret.slice(0, PREFIX_LENGTH));
    if (!key || !safeEqualHex(sha256Hex(secret), key.hash)) return null;
    const user = await this.deps.users.findById(key.userId);
    if (!user || user.banned) return null;
    // The key acts with its owner's role in its workspace; once they have left, it stops working.
    const workspaceRole = await this.deps.workspaces.getRole(key.workspaceId, key.userId);
    if (!workspaceRole) return null;

    const now = this.deps.clock.now();
    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.deps.apiKeys.touch(key.id, now);
    }
    const role: Role = user.role === "admin" ? "admin" : "user";
    return {
      actor: { kind: "user", userId: user.id, role, workspace: { id: key.workspaceId, role: workspaceRole } },
      keyId: key.id,
    };
  }
}
