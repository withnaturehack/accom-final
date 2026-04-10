import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const messAttendanceTable = pgTable("mess_attendance", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  volunteerId: text("volunteer_id"),
  hostelId: text("hostel_id"),
  date: text("date").notNull(),
  meal: text("meal").notNull(),
  present: text("present").notNull().default("true"),
  markedAt: timestamp("marked_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MessAttendance = typeof messAttendanceTable.$inferSelect;
