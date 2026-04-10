import {
  db,
  usersTable,
  hostelsTable,
  announcementsTable,
  notificationsTable,
  emergencyContactsTable,
  studentInventoryTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";

function generateId() { return crypto.randomBytes(8).toString("hex"); }
async function hashPassword(p: string) { return bcrypt.hash(p, 8); }

const REAL_HOSTELS = [
  "Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
  "Jamuna","Krishna","Mandakini","Narmada","Saraswathi",
  "Sharavathi","Swarnamukhi","Tapti",
];

export async function autoSeed() {
  try {
    // --- Hostels ---
    const existingHostels = await db.select().from(hostelsTable);
    let hostelIds: string[] = existingHostels.map(h => h.id);

    if (existingHostels.length === 0) {
      for (const name of REAL_HOSTELS) {
        await db.insert(hostelsTable).values({ id: name, name, location: "IITM Campus" }).onConflictDoNothing();
        hostelIds.push(name);
      }
      console.log("[seed] Real hostels created");
    }

    const [hostelId1, hostelId2] = [hostelIds[0] ?? "Mandakini", hostelIds[1] ?? "Cauvery"];

    // --- Staff Demo Accounts (upsert — safe under concurrent workers) ---
    const staffAccounts = [
      { email: "volunteer@iitm.ac.in", name: "Priya Volunteer", role: "volunteer", hostelId: hostelId1, area: "Operations", assignedHostelIds: "[]" },
      { email: "coordinator@iitm.ac.in", name: "Ravi Coordinator", role: "coordinator", hostelId: null, area: "Administration", assignedHostelIds: JSON.stringify([hostelId1, hostelId2]) },
      { email: "admin@iitm.ac.in", name: "Admin IITM", role: "admin", hostelId: null, area: null, assignedHostelIds: "[]" },
      { email: "superadmin@iitm.ac.in", name: "Super Admin", role: "superadmin", hostelId: null, area: null, assignedHostelIds: "[]" },
      { email: "volunteer2@iitm.ac.in", name: "Suresh Volunteer", role: "volunteer", hostelId: hostelId2, area: "Operations", assignedHostelIds: "[]" },
    ];

    for (const u of staffAccounts) {
      await db.insert(usersTable).values({
        id: generateId(), name: u.name, email: u.email,
        passwordHash: await hashPassword("123456"), role: u.role,
        hostelId: u.hostelId ?? undefined,
        area: u.area ?? undefined,
        assignedHostelIds: u.assignedHostelIds,
        phone: `+91 98765${String(43000 + staffAccounts.indexOf(u)).padStart(5, "0")}`,
        isActive: true,
      }).onConflictDoNothing();
    }

    const [{ count: studentCount }] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "student"));
    console.log(`[seed] Students in DB: ${studentCount} across ${hostelIds.length} hostels`);

    // --- Emergency Contacts ---
    const [{ count: contactCount }] = await db.select({ count: count() }).from(emergencyContactsTable);
    if (Number(contactCount) === 0) {
      await db.insert(emergencyContactsTable).values([
        { id: generateId(), hostelId: "", name: "Health Center", role: "Medical", phone: "044-22578430", isAvailable24x7: "true" },
        { id: generateId(), hostelId: "", name: "Dean of Students Office", role: "Administration", phone: "044-22578200", isAvailable24x7: "false" },
        { id: generateId(), hostelId: "", name: "Campus Police", role: "Security", phone: "044-22578100", isAvailable24x7: "true" },
        { id: generateId(), hostelId: "", name: "Security Control Room", role: "Security", phone: "044-22578500", isAvailable24x7: "true" },
        { id: generateId(), hostelId: "", name: "Ambulance (Campus)", role: "Medical", phone: "044-22578911", isAvailable24x7: "true" },
      ]);
      console.log("[seed] Emergency contacts created");
    }

    // --- Announcements ---
    const [{ count: annCount }] = await db.select({ count: count() }).from(announcementsTable);
    if (Number(annCount) === 0) {
      const [admin] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@iitm.ac.in"));
      if (admin) {
        const announcementsData = [
          { id: generateId(), title: "Welcome to CampusOps!", content: "Your centralized portal for hostel management, attendance tracking, inventory, and campus communications.", category: "general" as const, createdBy: admin.id },
          { id: generateId(), title: "Mess Timings", content: "Breakfast 7:00–9:00 AM | Lunch 12:00–2:00 PM | Dinner 7:00–9:30 PM", category: "hostel" as const, createdBy: admin.id },
          { id: generateId(), title: "Hostel Inventory Drive", content: "All students must submit mattress, bedsheet, and pillow details. Contact your hostel volunteer.", category: "hostel" as const, createdBy: admin.id },
        ];
        await db.insert(announcementsTable).values(announcementsData);
        console.log("[seed] Announcements created");
      }
    }

    // --- Student Inventory Seed (first 40 students only) ---
    const [{ count: invCount }] = await db.select({ count: count() }).from(studentInventoryTable);
    if (Number(invCount) < 10) {
      const students = await db.select({ id: usersTable.id, hostelId: usersTable.hostelId })
        .from(usersTable).where(eq(usersTable.role, "student"));
      const existingInv = await db.select({ studentId: studentInventoryTable.studentId }).from(studentInventoryTable);
      const invSet = new Set(existingInv.map(i => i.studentId));

      let created = 0;
      for (const s of students.slice(0, 40)) {
        if (invSet.has(s.id)) continue;
        await db.insert(studentInventoryTable).values({
          id: generateId(), studentId: s.id, hostelId: s.hostelId,
          mattress: Math.random() > 0.2, bedsheet: Math.random() > 0.25, pillow: Math.random() > 0.35,
          updatedBy: "seed",
        });
        created++;
      }
      if (created > 0) console.log(`[seed] Created ${created} inventory records`);
    }

    console.log("[seed] Auto-seed complete ✓");
  } catch (err) {
    console.error("[seed] Fatal seed error:", err);
  }
}
