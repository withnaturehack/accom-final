import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hostelsTable = pgTable("hostels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  totalRooms: integer("total_rooms"),
  wardenName: text("warden_name"),
  wardenPhone: text("warden_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emergencyContactsTable = pgTable("emergency_contacts", {
  id: text("id").primaryKey(),
  hostelId: text("hostel_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  phone: text("phone").notNull(),
  isAvailable24x7: text("is_available_24x7").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHostelSchema = createInsertSchema(hostelsTable).omit({ createdAt: true });
export type InsertHostel = z.infer<typeof insertHostelSchema>;
export type Hostel = typeof hostelsTable.$inferSelect;

export const insertContactSchema = createInsertSchema(emergencyContactsTable).omit({ createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type EmergencyContact = typeof emergencyContactsTable.$inferSelect;
