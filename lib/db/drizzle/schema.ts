import { pgTable, unique, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const announcementCategory = pgEnum("announcement_category", ['general', 'urgent', 'academic', 'hostel', 'event'])
export const lostItemStatus = pgEnum("lost_item_status", ['lost', 'found', 'claimed'])
export const notificationType = pgEnum("notification_type", ['announcement', 'lostitem', 'discipline', 'general'])


export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	role: text().default('student').notNull(),
	rollNumber: text("roll_number"),
	phone: text(),
	contactNumber: text("contact_number"),
	area: text(),
	assignedMess: text("assigned_mess"),
	attendanceStatus: text("attendance_status").default('not_entered'),
	hostelId: text("hostel_id"),
	roomNumber: text("room_number"),
	isActive: boolean("is_active").default(true),
	lastActiveAt: timestamp("last_active_at", { mode: 'string' }),
	assignedHostelIds: text("assigned_hostel_ids").default('[]'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const emergencyContacts = pgTable("emergency_contacts", {
	id: text().primaryKey().notNull(),
	hostelId: text("hostel_id").notNull(),
	name: text().notNull(),
	role: text().notNull(),
	phone: text().notNull(),
	isAvailable24X7: text("is_available_24x7").default('false'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const hostels = pgTable("hostels", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	location: text(),
	totalRooms: integer("total_rooms"),
	wardenName: text("warden_name"),
	wardenPhone: text("warden_phone"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const lostItems = pgTable("lost_items", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	imageUrl: text("image_url"),
	status: lostItemStatus().default('lost').notNull(),
	reportedBy: text("reported_by").notNull(),
	location: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const announcements = pgTable("announcements", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	content: text().notNull(),
	category: announcementCategory().default('general').notNull(),
	createdBy: text("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text().notNull(),
	body: text().notNull(),
	type: notificationType().default('general').notNull(),
	isRead: text("is_read").default('false').notNull(),
	refId: text("ref_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const timeLogs = pgTable("time_logs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	hostelId: text("hostel_id"),
	type: text().default('login').notNull(),
	note: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const attendance = pgTable("attendance", {
	id: text().primaryKey().notNull(),
	studentId: text("student_id").notNull(),
	volunteerId: text("volunteer_id"),
	hostelId: text("hostel_id").notNull(),
	mess: text(),
	roomNumber: text("room_number"),
	status: text().default('not_entered').notNull(),
	date: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const studentInventory = pgTable("student_inventory", {
	id: text().primaryKey().notNull(),
	studentId: text("student_id").notNull(),
	hostelId: text("hostel_id"),
	mattress: boolean().default(false),
	bedsheet: boolean().default(false),
	pillow: boolean().default(false),
	updatedBy: text("updated_by"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	messCard: boolean("mess_card").default(false),
	inventoryLocked: boolean("inventory_locked").default(false),
	lockedBy: text("locked_by"),
	lockedAt: timestamp("locked_at", { mode: 'string' }),
});

export const checkins = pgTable("checkins", {
	id: text().primaryKey().notNull(),
	studentId: text("student_id").notNull(),
	volunteerId: text("volunteer_id"),
	hostelId: text("hostel_id"),
	checkInTime: timestamp("check_in_time", { mode: 'string' }),
	checkOutTime: timestamp("check_out_time", { mode: 'string' }),
	date: text().notNull(),
	note: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const messAttendance = pgTable("mess_attendance", {
	id: text().primaryKey().notNull(),
	studentId: text("student_id").notNull(),
	volunteerId: text("volunteer_id"),
	hostelId: text("hostel_id"),
	date: text().notNull(),
	meal: text().notNull(),
	present: text().default('true').notNull(),
	markedAt: timestamp("marked_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});
