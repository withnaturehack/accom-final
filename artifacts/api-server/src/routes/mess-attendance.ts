import { Router } from "express";
import { db, messAttendanceTable, usersTable, studentInventoryTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireVolunteer, generateId, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

const router = Router();

function todayStr() { return new Date().toISOString().split("T")[0]; }

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function scopedHostels(caller: { role: string; hostelId: string | null; assignedHostelIds?: string | null }) {
  if (caller.role === "superadmin") return null;
  if (caller.role === "volunteer") return [caller.hostelId || ""].filter(Boolean);
  const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
  if (assigned.length > 0) return Array.from(new Set(assigned));
  return [caller.hostelId || ""].filter(Boolean);
}

function canAccessHostel(scope: string[] | null, hostelId?: string | null) {
  if (!scope) return true;
  if (!hostelId) return false;
  return scope.includes(hostelId);
}

// POST /api/mess-attendance/:studentId — mark/toggle a student for a specific meal
router.post("/:studentId", requireVolunteer, async (req: AuthRequest, res) => {
  const studentId = String(req.params.studentId);
  const { meal, present = "true", date } = req.body;
  const targetDate = date || todayStr();

  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scope = scopedHostels(caller);

  if (!meal || !["breakfast", "lunch", "dinner", "snacks"].includes(meal)) {
    res.status(400).json({ message: "meal must be one of: breakfast, lunch, dinner, snacks" });
    return;
  }

  const [student] = await db.select({ id: usersTable.id, hostelId: usersTable.hostelId })
    .from(usersTable).where(eq(usersTable.id, studentId));

  if (!student) { res.status(404).json({ message: "Student not found" }); return; }
  if (!canAccessHostel(scope, student.hostelId)) { res.status(403).json({ message: "Forbidden" }); return; }

  // Upsert: delete existing for this student+meal+date then re-insert
  const [existing] = await db.select().from(messAttendanceTable)
    .where(and(eq(messAttendanceTable.studentId, studentId), eq(messAttendanceTable.meal, meal), eq(messAttendanceTable.date, targetDate)));

  if (existing) {
    // Toggle: if same present value, remove (toggle off); otherwise update
    const newPresent = existing.present === present ? (present === "true" ? "false" : "true") : present;
    const [updated] = await db.update(messAttendanceTable)
      .set({ present: newPresent, volunteerId: req.userId!, markedAt: new Date() })
      .where(eq(messAttendanceTable.id, existing.id))
      .returning();
    res.json({ ...updated, markedAt: updated.markedAt?.toISOString(), createdAt: updated.createdAt.toISOString() });
    return;
  }

  const [record] = await db.insert(messAttendanceTable).values({
    id: generateId(),
    studentId,
    volunteerId: req.userId!,
    hostelId: student.hostelId || "",
    date: targetDate,
    meal,
    present,
    markedAt: new Date(),
  }).returning();

  res.status(201).json({ ...record, markedAt: record.markedAt?.toISOString(), createdAt: record.createdAt.toISOString() });
});

// GET /api/mess-attendance — list today's mess attendance
router.get("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { date, hostelId: filterHostelId, meal } = req.query;
  const targetDate = (date as string) || todayStr();
  const requestedHostelId = typeof filterHostelId === "string" ? filterHostelId : "";

  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const rows = await db.select({
    id: messAttendanceTable.id,
    studentId: messAttendanceTable.studentId,
    volunteerId: messAttendanceTable.volunteerId,
    hostelId: messAttendanceTable.hostelId,
    date: messAttendanceTable.date,
    meal: messAttendanceTable.meal,
    present: messAttendanceTable.present,
    markedAt: messAttendanceTable.markedAt,
    createdAt: messAttendanceTable.createdAt,
    studentName: usersTable.name,
    studentEmail: usersTable.email,
    studentRoom: usersTable.roomNumber,
    studentMess: usersTable.assignedMess,
  })
    .from(messAttendanceTable)
    .leftJoin(usersTable, eq(messAttendanceTable.studentId, usersTable.id))
    .where(eq(messAttendanceTable.date, targetDate))
    .orderBy(desc(messAttendanceTable.markedAt));

  let filtered = rows;

  if (caller.role === "superadmin") {
    if (requestedHostelId) filtered = filtered.filter(r => r.hostelId === requestedHostelId);
  } else if (caller.role === "volunteer") {
    filtered = filtered.filter(r => r.hostelId === caller.hostelId);
    if (requestedHostelId && requestedHostelId !== caller.hostelId) {
      res.json([]);
      return;
    }
    if (requestedHostelId) filtered = filtered.filter(r => r.hostelId === requestedHostelId);
  } else {
    const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
    const scoped = assigned.length > 0
      ? Array.from(new Set(assigned))
      : [caller.hostelId || ""].filter(Boolean);
    if (scoped.length === 0) {
      res.json([]);
      return;
    }
    if (requestedHostelId && !scoped.includes(requestedHostelId)) {
      res.json([]);
      return;
    }
    filtered = filtered.filter(r => scoped.includes(r.hostelId || ""));
    if (requestedHostelId) filtered = filtered.filter(r => r.hostelId === requestedHostelId);
  }

  if (meal) filtered = filtered.filter(r => r.meal === meal);

  res.json(filtered.map(r => ({
    ...r,
    markedAt: r.markedAt?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
    present: r.present === "true",
  })));
});

// GET /api/mess-attendance/stats — today's mess card stats for dashboard
router.get("/stats", requireVolunteer, async (req: AuthRequest, res) => {
  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const scopedHostelIds = caller.role === "superadmin"
    ? null
    : caller.role === "volunteer"
      ? (caller.hostelId ? [caller.hostelId] : [])
      : (() => {
        const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
        return assigned.length > 0
          ? Array.from(new Set(assigned))
          : (caller.hostelId ? [caller.hostelId] : []);
      })();

  if (scopedHostelIds && scopedHostelIds.length === 0) {
    res.json({ cardGivenCount: 0, totalStudents: 0, total: 0 });
    return;
  }

  const [inventoryRows, studentRows] = await Promise.all([
    db.select({
      studentId: studentInventoryTable.studentId,
      hostelId: studentInventoryTable.hostelId,
      messCard: studentInventoryTable.messCard,
    }).from(studentInventoryTable),
    db.select({ id: usersTable.id }).from(usersTable).where(
      scopedHostelIds
        ? and(inArray(usersTable.hostelId, scopedHostelIds), eq(usersTable.role, "student"))
        : eq(usersTable.role, "student")
    ),
  ]);

  const relevant = scopedHostelIds
    ? inventoryRows.filter(r => scopedHostelIds.includes(r.hostelId || ""))
    : inventoryRows;

  const cardGivenCount = relevant.filter(r => r.messCard === true).length;
  const totalStudents = studentRows.length;

  res.json({
    cardGivenCount,
    totalStudents,
    total: relevant.length,
  });
});

export default router;
