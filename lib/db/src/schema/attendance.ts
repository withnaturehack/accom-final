import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const attendanceTable = pgTable("attendance", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  volunteerId: text("volunteer_id"),
  hostelId: text("hostel_id").notNull(),
  mess: text("mess"),
  roomNumber: text("room_number"),
  status: text("status").notNull().default("not_entered"),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const studentInventoryTable = pgTable("student_inventory", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  hostelId: text("hostel_id"),
  mattress: boolean("mattress").default(false),
  bedsheet: boolean("bedsheet").default(false),
  pillow: boolean("pillow").default(false),
  mattressSubmitted: boolean("mattress_submitted").default(false),
  bedsheetSubmitted: boolean("bedsheet_submitted").default(false),
  pillowSubmitted: boolean("pillow_submitted").default(false),
  messCard: boolean("mess_card").default(false),
  messCardGivenAt: timestamp("mess_card_given_at"),
  messCardRevokedAt: timestamp("mess_card_revoked_at"),
  inventoryLocked: boolean("inventory_locked").default(false),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Attendance = typeof attendanceTable.$inferSelect;
export type StudentInventory = typeof studentInventoryTable.$inferSelect;
