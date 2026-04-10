-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."announcement_category" AS ENUM('general', 'urgent', 'academic', 'hostel', 'event');--> statement-breakpoint
CREATE TYPE "public"."lost_item_status" AS ENUM('lost', 'found', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('announcement', 'lostitem', 'discipline', 'general');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"roll_number" text,
	"phone" text,
	"contact_number" text,
	"area" text,
	"assigned_mess" text,
	"attendance_status" text DEFAULT 'not_entered',
	"hostel_id" text,
	"room_number" text,
	"is_active" boolean DEFAULT true,
	"last_active_at" timestamp,
	"assigned_hostel_ids" text DEFAULT '[]',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text NOT NULL,
	"is_available_24x7" text DEFAULT 'false',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"total_rooms" integer,
	"warden_name" text,
	"warden_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lost_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"status" "lost_item_status" DEFAULT 'lost' NOT NULL,
	"reported_by" text NOT NULL,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" "announcement_category" DEFAULT 'general' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" "notification_type" DEFAULT 'general' NOT NULL,
	"is_read" text DEFAULT 'false' NOT NULL,
	"ref_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hostel_id" text,
	"type" text DEFAULT 'login' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"volunteer_id" text,
	"hostel_id" text NOT NULL,
	"mess" text,
	"room_number" text,
	"status" text DEFAULT 'not_entered' NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"hostel_id" text,
	"mattress" boolean DEFAULT false,
	"bedsheet" boolean DEFAULT false,
	"pillow" boolean DEFAULT false,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"mess_card" boolean DEFAULT false,
	"inventory_locked" boolean DEFAULT false,
	"locked_by" text,
	"locked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"volunteer_id" text,
	"hostel_id" text,
	"check_in_time" timestamp,
	"check_out_time" timestamp,
	"date" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mess_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"volunteer_id" text,
	"hostel_id" text,
	"date" text NOT NULL,
	"meal" text NOT NULL,
	"present" text DEFAULT 'true' NOT NULL,
	"marked_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);

*/