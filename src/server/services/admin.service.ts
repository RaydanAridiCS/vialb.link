import type { Actor, InstanceStats } from "@/server/domain/types";
import type { Clock } from "@/server/ports/clock";
import type { IClickRepository } from "@/server/repositories/click.repository";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";
import { requireAdmin } from "./authorization";

export class AdminService {
  constructor(
    private readonly deps: {
      users: IUserRepository;
      links: ILinkRepository;
      clicks: IClickRepository;
      clock: Clock;
    },
  ) {}

  async stats(actor: Actor): Promise<InstanceStats> {
    requireAdmin(actor);
    const since = new Date(this.deps.clock.now().getTime() - 24 * 3_600_000);
    const [users, links, clicks, clicks24h] = await Promise.all([
      this.deps.users.count(),
      this.deps.links.count(),
      this.deps.clicks.count(),
      this.deps.clicks.count(since),
    ]);
    return { users, links, clicks, clicks24h };
  }
}
