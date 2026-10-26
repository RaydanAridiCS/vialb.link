import { index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { WorkspaceRole } from "@/lib/permissions";
import { user } from "./auth";

/**
 * Links, API keys and analytics belong to a workspace. Everyone has a personal one (created the first
 * time they sign in); teams are extra workspaces with several members.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  /**
   * Set for a person's own workspace (and unique, so there is only one). It also ties the workspace to
   * the account: deleting the user deletes their personal workspace and everything in it.
   */
  personalUserId: text("personal_user_id")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

/** A pending invitation. Accepting or revoking it deletes the row. Only a hash of the token is stored. */
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Lowercase. The person who accepts must sign in with this address. */
    email: text("email").notNull(),
    role: text("role").$type<WorkspaceRole>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("workspace_invites_email_unique").on(t.workspaceId, t.email)],
);
