import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const checkinsTable = pgTable("checkins", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  volunteerId: text("volunteer_id"),
  hostelId: text("hostel_id"),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  date: text("date").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Checkin = typeof checkinsTable.$inferSelect;
