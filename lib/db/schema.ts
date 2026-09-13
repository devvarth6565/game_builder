import type { UIMessage } from "ai";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
