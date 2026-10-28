import type { LinkHealth } from "@/server/domain/types";

/** A link due for a destination check, with everything the check needs. */
export interface HealthCandidate {
  linkId: string;
  workspaceId: string;
  destinationUrl: string;
  /** Smart-routing and split targets besides the destination. */
  extraTargets: string[];
  health: LinkHealth | null;
}

export interface FlaggedLink {
  linkId: string;
  code: string;
  title: string | null;
  destinationUrl: string;
  reason: LinkHealth["lastReason"];
  failingTarget: string | null;
  flaggedAt: Date | null;
}

export interface ILinkHealthRepository {
  /**
   * Links that should be checked now: enabled, not deleted, not expired, not out of clicks, no password,
   * owned by a workspace, and either never checked or past `nextCheckAt`. Oldest first.
   */
  listDue(now: Date, limit: number): Promise<HealthCandidate[]>;
  find(linkId: string): Promise<LinkHealth | null>;
  findMany(linkIds: readonly string[]): Promise<LinkHealth[]>;
  /** Inserts or replaces the whole row. */
  save(health: LinkHealth): Promise<void>;
  /** Forgets a link's record (its target changed, so old results no longer apply). */
  delete(linkId: string): Promise<void>;
  /** Hides a flag until the link recovers. Returns false when there is nothing flagged to dismiss. */
  dismiss(linkId: string, at: Date): Promise<boolean>;
  /** Workspaces that currently have at least one link needing attention. */
  listWorkspacesWithFlagged(): Promise<string[]>;
  /** Flagged, not dismissed, still-active links of a workspace (for the weekly digest). */
  listFlaggedByWorkspace(workspaceId: string, limit: number): Promise<FlaggedLink[]>;
}
