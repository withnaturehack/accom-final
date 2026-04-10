import { Router } from "express";
import { db, checkinsTable, usersTable, studentInventoryTable, attendanceTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireVolunteer, generateId, AuthRequest } from "../lib/auth.js";

const router = Router();

function todayStr() { return new Date().toISOString().split("T")[0]; }

function scopedHostels(caller: { role: string; hostelId: string | null; assignedHostelIds?: string | null }) {
  if (caller.role === "superadmin") return null;
  if (caller.role === "volunteer") return [caller.hostelId || ""].filter(Boolean);
  const assigned = JSON.parse(caller.assignedHostelIds || "[]") as string[];
  return Array.from(new Set([...(assigned || []), caller.hostelId || ""].filter(Boolean)));
}

function canAccessHostel(scope: string[] | null, hostelId?: string | null) {
  if (!scope) return true;
  if (!hostelId) return false;
  return scope.includes(hostelId);
}

// Reset inventory to blank state (called on check-in or clear)
async function resetInventory(studentId: string, hostelId: string, updatedBy: string) {
  const [existing] = await db.select().from(studentInventoryTable)
    .where(eq(studentInventoryTable.studentId, studentId));

  if (existing) {
    await db.update(studentInventoryTable).set({
      mattress: false,
      bedsheet: false,
      pillow: false,
      mattressSubmitted: false,
      bedsheetSubmitted: false,
      pillowSubmitted: false,
      inventoryLocked: false,
      messCard: false,
      messCardGivenAt: null,
      messCardRevokedAt: null,
      lockedBy: null,
      lockedAt: null,
      updatedBy,
      updatedAt: new Date(),
    }).where(eq(studentInventoryTable.id, existing.id));
  } else {
    await db.insert(studentInventoryTable).values({
      id: generateId(),
      studentId,
      hostelId: hostelId || null,
      mattress: false,
      bedsheet: false,
      pillow: false,
      mattressSubmitted: false,
      bedsheetSubmitted: false,
      pillowSubmitted: false,
      inventoryLocked: false,
      messCard: false,
      messCardGivenAt: null,
      messCardRevokedAt: null,
      updatedBy,
    });
  }
}

// POST /api/checkins/:studentId — mark student check-in (resets inventory)
router.post("/:studentId", requireVolunteer, async (req: AuthRequest, res) => {
  const studentId = String(req.params.studentId);
  const { note } = req.body;
  const date = todayStr();

  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scope = scopedHostels(caller);

  const [student] = await db.select({
    id: usersTable.id,
    hostelId: usersTable.hostelId,
    roomNumber: usersTable.roomNumber,
    assignedMess: usersTable.assignedMess,
  })
    .from(usersTable).where(eq(usersTable.id, studentId));

  if (!student) { res.status(404).json({ message: "Student not found" }); return; }
  if (!canAccessHostel(scope, student.hostelId)) { res.status(403).json({ message: "Forbidden" }); return; }

  // Check for existing check-in today
  const [existing] = await db.select().from(checkinsTable)
    .where(and(eq(checkinsTable.studentId, studentId), eq(checkinsTable.date, date)));

  if (existing) {
    await db.update(usersTable)
      .set({ attendanceStatus: existing.checkOutTime ? "not_entered" : "entered" })
      .where(eq(usersTable.id, studentId));

    res.json({
      ...existing,
      checkInTime: existing.checkInTime?.toISOString() || null,
      checkOutTime: existing.checkOutTime?.toISOString() || null,
      alreadyCheckedIn: true,
    });
    return;
  }

  const [record] = await db.insert(checkinsTable).values({
    id: generateId(),
    studentId,
    volunteerId: req.userId!,
    hostelId: student.hostelId || "",
    checkInTime: new Date(),
    date,
    note: note || null,
  }).returning();

  // Reset inventory fresh on every new check-in
  await resetInventory(studentId, student.hostelId || "", req.userId!);

  // Keep attendance stats in sync with check-in status.
  const [existingAttendance] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.studentId, studentId), eq(attendanceTable.date, date)));

  if (existingAttendance) {
    await db.update(attendanceTable).set({
      status: "entered",
      volunteerId: req.userId!,
      hostelId: student.hostelId || "",
      roomNumber: student.roomNumber || null,
      mess: student.assignedMess || null,
      updatedAt: new Date(),
    }).where(eq(attendanceTable.id, existingAttendance.id));
  } else {
    await db.insert(attendanceTable).values({
      id: generateId(),
      studentId,
      volunteerId: req.userId!,
      hostelId: student.hostelId || "",
      mess: student.assignedMess || null,
      roomNumber: student.roomNumber || null,
      status: "entered",
      date,
    });
  }

  // Keep list status in sync for screens that read users.attendanceStatus.
  await db.update(usersTable)
    .set({ attendanceStatus: "entered" })
    .where(eq(usersTable.id, studentId));

  res.status(201).json({
    ...record,
    checkInTime: record.checkInTime?.toISOString() || null,
    checkOutTime: null,
    createdAt: record.createdAt.toISOString(),
  });
});

// PATCH /api/checkins/:id/checkout — check out
router.patch("/:id/checkout", requireVolunteer, async (req: AuthRequest, res) => {
  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scope = scopedHostels(caller);

  const [checkin] = await db.select().from(checkinsTable).where(eq(checkinsTable.id, String(req.params.id)));
  if (!checkin) { res.status(404).json({ message: "Checkin record not found" }); return; }
  if (!canAccessHostel(scope, checkin.hostelId)) { res.status(403).json({ message: "Forbidden" }); return; }

  const [record] = await db.update(checkinsTable)
    .set({ checkOutTime: new Date() })
    .where(eq(checkinsTable.id, String(req.params.id)))
    .returning();

  await db.update(usersTable)
    .set({ attendanceStatus: "not_entered" })
    .where(eq(usersTable.id, checkin.studentId));

  const [student] = await db.select({
    hostelId: usersTable.hostelId,
    roomNumber: usersTable.roomNumber,
    assignedMess: usersTable.assignedMess,
  }).from(usersTable).where(eq(usersTable.id, checkin.studentId));

  const [existingAttendance] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.studentId, checkin.studentId), eq(attendanceTable.date, checkin.date)));

  if (existingAttendance) {
    await db.update(attendanceTable).set({
      status: "not_entered",
      volunteerId: req.userId!,
      hostelId: student?.hostelId || checkin.hostelId || "",
      roomNumber: student?.roomNumber || null,
      mess: student?.assignedMess || null,
      updatedAt: new Date(),
    }).where(eq(attendanceTable.id, existingAttendance.id));
  } else {
    await db.insert(attendanceTable).values({
      id: generateId(),
      studentId: checkin.studentId,
      volunteerId: req.userId!,
      hostelId: student?.hostelId || checkin.hostelId || "",
      mess: student?.assignedMess || null,
      roomNumber: student?.roomNumber || null,
      status: "not_entered",
      date: checkin.date,
    });
  }

  res.json({
    ...record,
    checkInTime: record.checkInTime?.toISOString() || null,
    checkOutTime: record.checkOutTime?.toISOString() || null,
    createdAt: record.createdAt.toISOString(),
  });
});

// DELETE /api/checkins/:studentId/today — clear today's check-in + reset inventory
router.delete("/:studentId/today", requireVolunteer, async (req: AuthRequest, res) => {
  const studentId = String(req.params.studentId);
  const date = todayStr();

  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scope = scopedHostels(caller);

  const [student] = await db.select({ id: usersTable.id, hostelId: usersTable.hostelId })
    .from(usersTable).where(eq(usersTable.id, studentId));

  if (!student) { res.status(404).json({ message: "Student not found" }); return; }
  if (!canAccessHostel(scope, student.hostelId)) { res.status(403).json({ message: "Forbidden" }); return; }

  // Delete today's check-in record
  await db.delete(checkinsTable)
    .where(and(eq(checkinsTable.studentId, studentId), eq(checkinsTable.date, date)));

  // Clear attendance entry for the same day to keep dashboard totals accurate.
  await db.delete(attendanceTable)
    .where(and(eq(attendanceTable.studentId, studentId), eq(attendanceTable.date, date)));

  // Reset inventory
  await resetInventory(studentId, student.hostelId || "", req.userId!);

  await db.update(usersTable)
    .set({ attendanceStatus: "not_entered" })
    .where(eq(usersTable.id, studentId));

  res.json({ success: true, message: "Check-in and inventory cleared for today" });
});

// GET /api/checkins/:studentId/today — get today's check-in status for a student
router.get("/:studentId/today", requireVolunteer, async (req: AuthRequest, res) => {
  const studentId = String(req.params.studentId);
  const date = todayStr();

  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scope = scopedHostels(caller);

  const [student] = await db.select({ hostelId: usersTable.hostelId })
    .from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }
  if (!canAccessHostel(scope, student.hostelId)) { res.status(403).json({ message: "Forbidden" }); return; }

  const [checkin] = await db.select().from(checkinsTable)
    .where(and(eq(checkinsTable.studentId, studentId), eq(checkinsTable.date, date)));

  const [inv] = await db.select().from(studentInventoryTable)
    .where(eq(studentInventoryTable.studentId, studentId));

  res.json({
    checkin: checkin ? {
      ...checkin,
      checkInTime: checkin.checkInTime?.toISOString() || null,
      checkOutTime: checkin.checkOutTime?.toISOString() || null,
      createdAt: checkin.createdAt.toISOString(),
    } : null,
    inventory: inv || {
      mattress: false, bedsheet: false, pillow: false,
      mattressSubmitted: false, bedsheetSubmitted: false, pillowSubmitted: false,
      inventoryLocked: false, messCard: false,
    },
  });
});

// GET /api/checkins — list check-ins
router.get("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { hostelId, date, limit: rawLimit, offset: rawOffset } = req.query;
  const limit = Math.min(Number(rawLimit) || 100, 500);
  const offset = Number(rawOffset) || 0;
  const targetDate = (date as string) || todayStr();
  const requestedHostelId = typeof hostelId === "string" ? hostelId : "";

  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  const scoped = scopedHostels(caller);

  // Reject early if no hostel access
  if (scoped && scoped.length === 0) { res.json([]); return; }
  if (scoped && requestedHostelId && !scoped.includes(requestedHostelId)) { res.json([]); return; }

  // Build WHERE conditions in SQL — filter date and hostel in the database, not in JS
  const effectiveHostels = requestedHostelId
    ? [requestedHostelId]
    : scoped;

  const conditions = [eq(checkinsTable.date, targetDate)];
  if (effectiveHostels) {
    conditions.push(inArray(checkinsTable.hostelId, effectiveHostels));
  }

  const rows = await db.select({
    id: checkinsTable.id,
    studentId: checkinsTable.studentId,
    volunteerId: checkinsTable.volunteerId,
    hostelId: checkinsTable.hostelId,
    checkInTime: checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
    date: checkinsTable.date,
    note: checkinsTable.note,
    createdAt: checkinsTable.createdAt,
    studentName: usersTable.name,
    studentEmail: usersTable.email,
    studentRoll: usersTable.rollNumber,
    studentRoom: usersTable.roomNumber,
    studentMess: usersTable.assignedMess,
  }).from(checkinsTable)
    .leftJoin(usersTable, eq(checkinsTable.studentId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(checkinsTable.checkInTime))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    checkInTime: r.checkInTime?.toISOString() || null,
    checkOutTime: r.checkOutTime?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// GET /api/checkins/stats
router.get("/stats", requireVolunteer, async (req: AuthRequest, res) => {
  const date = todayStr();
  const all = await db.select({
    id: checkinsTable.id,
    checkOutTime: checkinsTable.checkOutTime,
    hostelId: checkinsTable.hostelId,
  }).from(checkinsTable).where(eq(checkinsTable.date, date));

  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  const relevant = caller.role === "superadmin"
    ? all
    : caller.role === "volunteer"
      ? all.filter(r => r.hostelId === caller.hostelId)
      : (() => {
    const scoped = Array.from(new Set([...(JSON.parse(caller.assignedHostelIds || "[]") as string[]), caller.hostelId || ""].filter(Boolean)));
        return scoped.length ? all.filter(r => scoped.includes(r.hostelId || "")) : [];
      })();

  res.json({
    date,
    total: relevant.length,
    checkedIn: relevant.length,
    checkedOut: relevant.filter(r => !!r.checkOutTime).length,
  });
});

export default router;
