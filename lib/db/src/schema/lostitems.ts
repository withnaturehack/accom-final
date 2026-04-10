import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lostItemStatusEnum = pgEnum("lost_item_status", ["lost", "found", "claimed"]);

export const lostItemsTable = pgTable("lost_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  status: lostItemStatusEnum("status").default("lost").notNull(),
  reportedBy: text("reported_by").notNull(),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLostItemSchema = createInsertSchema(lostItemsTable).omit({ createdAt: true, updatedAt: true });
export type InsertLostItem = z.infer<typeof insertLostItemSchema>;
export type LostItem = typeof lostItemsTable.$inferSelect;
