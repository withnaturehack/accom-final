import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const timeLogsTable = pgTable("time_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  hostelId: text("hostel_id"),
  type: text("type").notNull().default("login"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TimeLog = typeof timeLogsTable.$inferSelect;
