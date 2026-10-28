import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { workspaces } from "./workspaces";

/**
 * A flat, single-parent grouping of a workspace's links (a link is in at most one folder). Names are unique
 * per workspace ignoring case. Deleting a folder keeps its links; they simply end up in no folder.
 */
export const folders = pgTable(
  "folders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("folders_workspace_name_unique").on(t.workspaceId, sql`lower(${t.name})`)],
);
