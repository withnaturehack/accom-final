import { Router } from "express";
import { db, attendanceTable, usersTable, studentInventoryTable, checkinsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireVolunteer, generateId, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

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

// GET /api/attendance?hostelId=&date= — returns students with attendance + inventory data
router.get("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { hostelId, date } = req.query;
  const targetDate = (date as string) || todayStr();
  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  const requestedHostel = hostelId ? String(hostelId) : "";
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

  if (scopedHostelIds && scopedHostelIds.length === 0) { res.json([]); return; }

  if (requestedHostel && scopedHostelIds && !scopedHostelIds.includes(requestedHostel)) {
    res.json([]); return;
  }

  const targetHostelIds = requestedHostel ? [requestedHostel] : scopedHostelIds;

  const students = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    roomNumber: usersTable.roomNumber,
    assignedMess: usersTable.assignedMess,
    hostelId: usersTable.hostelId,
  }).from(usersTable).where(
    targetHostelIds
      ? and(inArray(usersTable.hostelId, targetHostelIds), eq(usersTable.role, "student"))
      : eq(usersTable.role, "student")
  );

  const records = await db.select().from(attendanceTable).where(
    targetHostelIds
      ? and(inArray(attendanceTable.hostelId, targetHostelIds), eq(attendanceTable.date, targetDate))
      : eq(attendanceTable.date, targetDate)
  );

  const inventoryRecords = await db.select().from(studentInventoryTable).where(
    targetHostelIds ? inArray(studentInventoryTable.hostelId, targetHostelIds) : sql`1=1`
  );

  const recordMap: Record<string, typeof records[0]> = {};
  records.forEach(r => { recordMap[r.studentId] = r; });

  const inventoryMap: Record<string, typeof inventoryRecords[0]> = {};
  inventoryRecords.forEach(i => { inventoryMap[i.studentId] = i; });

  const result = students.map(s => ({
    ...s,
    attendance: recordMap[s.id] || { status: "not_entered", date: targetDate },
    hasAttendance: !!recordMap[s.id],
    inventory: inventoryMap[s.id] ? {
      mattress: inventoryMap[s.id].mattress,
      bedsheet: inventoryMap[s.id].bedsheet,
      pillow: inventoryMap[s.id].pillow,
      mattressSubmitted: inventoryMap[s.id].mattressSubmitted,
      bedsheetSubmitted: inventoryMap[s.id].bedsheetSubmitted,
      pillowSubmitted: inventoryMap[s.id].pillowSubmitted,
      messCard: inventoryMap[s.id].messCard,
      messCardGivenAt: inventoryMap[s.id].messCardGivenAt?.toISOString() || null,
      messCardRevokedAt: inventoryMap[s.id].messCardRevokedAt?.toISOString() || null,
      inventoryLocked: inventoryMap[s.id].inventoryLocked,
      lockedAt: inventoryMap[s.id].lockedAt?.toISOString() || null,
    } : { mattress: false, bedsheet: false, pillow: false, mattressSubmitted: false, bedsheetSubmitted: false, pillowSubmitted: false, messCard: false, messCardGivenAt: null, messCardRevokedAt: null, inventoryLocked: false, lockedAt: null },
    hasInventory: !!inventoryMap[s.id],
  }));

  res.json(result);
});

// POST /api/attendance/:studentId — mark attendance
router.post("/:studentId", requireVolunteer, async (req: AuthRequest, res) => {
  const { status, mess } = req.body;
  const { studentId } = req.params;
  const date = todayStr();

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }

  const hostelId = student.hostelId || "";
  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.studentId, studentId), eq(attendanceTable.date, date)));

  let record;
  if (existing) {
    [record] = await db.update(attendanceTable)
      .set({ status: status || "entered", volunteerId: req.userId!, mess: mess || student.assignedMess, updatedAt: new Date() })
      .where(eq(attendanceTable.id, existing.id))
      .returning();
  } else {
    [record] = await db.insert(attendanceTable).values({
      id: generateId(),
      studentId,
      volunteerId: req.userId!,
      hostelId,
      mess: mess || student.assignedMess || null,
      roomNumber: student.roomNumber || null,
      status: status || "entered",
      date,
    }).returning();
  }

  await db.update(usersTable).set({ attendanceStatus: status || "entered" }).where(eq(usersTable.id, studentId));
  res.json({ ...record, createdAt: record.createdAt?.toISOString(), updatedAt: record.updatedAt?.toISOString() });
});

// GET /api/attendance/stats
router.get("/stats", requireVolunteer, async (req: AuthRequest, res) => {
  const date = todayStr();
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
    res.json({ date, total: 0, inCampus: 0, checkedOut: 0, pending: 0, entered: 0, notEntered: 0 });
    return;
  }

  // Count all students in scope (this is the real "total")
  const students = await db.select({ id: usersTable.id }).from(usersTable).where(
    scopedHostelIds
      ? and(inArray(usersTable.hostelId, scopedHostelIds), eq(usersTable.role, "student"))
      : eq(usersTable.role, "student")
  );
  const total = students.length;

  // Use checkinsTable for accurate in-campus / checked-out counts
  const todayCheckins = scopedHostelIds
    ? await db.select({ id: checkinsTable.id, checkOutTime: checkinsTable.checkOutTime })
        .from(checkinsTable)
        .where(and(eq(checkinsTable.date, date), inArray(checkinsTable.hostelId, scopedHostelIds)))
    : await db.select({ id: checkinsTable.id, checkOutTime: checkinsTable.checkOutTime })
        .from(checkinsTable)
        .where(eq(checkinsTable.date, date));

  const inCampus = todayCheckins.filter(c => !c.checkOutTime).length;
  const checkedOut = todayCheckins.filter(c => !!c.checkOutTime).length;
  const pending = total - inCampus - checkedOut;

  res.json({ date, total, inCampus, checkedOut, pending, entered: inCampus, notEntered: pending });
});

// GET /api/attendance/student/:studentId
router.get("/student/:studentId", requireAuth, async (req: AuthRequest, res) => {
  const records = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.studentId, req.params.studentId));
  res.json(records.map(r => ({ ...r, createdAt: r.createdAt?.toISOString(), updatedAt: r.updatedAt?.toISOString() })));
});

// GET /api/attendance/inventory/:studentId
router.get("/inventory/:studentId", requireAuth, async (req: AuthRequest, res) => {
  const { studentId } = req.params;
  const [record] = await db.select().from(studentInventoryTable).where(eq(studentInventoryTable.studentId, studentId));
  res.json(record
    ? {
      ...record,
      lockedAt: record.lockedAt?.toISOString() || null,
      messCardGivenAt: record.messCardGivenAt?.toISOString() || null,
      messCardRevokedAt: record.messCardRevokedAt?.toISOString() || null,
    }
    : {
      studentId,
      mattress: false,
      bedsheet: false,
      pillow: false,
      messCard: false,
      messCardGivenAt: null,
      messCardRevokedAt: null,
      inventoryLocked: false,
      lockedAt: null,
    });
});

// PATCH /api/attendance/inventory/:studentId — update room inventory (blocked if individual item already submitted)
router.patch("/inventory/:studentId", requireVolunteer, async (req: AuthRequest, res) => {
  const { mattress, bedsheet, pillow } = req.body;
  const { studentId } = req.params;

  const [student] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }

  const [existing] = await db.select().from(studentInventoryTable).where(eq(studentInventoryTable.studentId, studentId));

  if (existing?.inventoryLocked) {
    res.status(403).json({ message: "Inventory is locked and cannot be edited." });
    return;
  }

  // Block toggling an item that is already individually submitted
  if (mattress !== undefined && existing?.mattressSubmitted) {
    res.status(403).json({ message: "Mattress already submitted." }); return;
  }
  if (bedsheet !== undefined && existing?.bedsheetSubmitted) {
    res.status(403).json({ message: "Bedsheet already submitted." }); return;
  }
  if (pillow !== undefined && existing?.pillowSubmitted) {
    res.status(403).json({ message: "Pillow already submitted." }); return;
  }

  if (existing) {
    const [updated] = await db.update(studentInventoryTable).set({
      mattress: mattress !== undefined ? mattress : existing.mattress,
      bedsheet: bedsheet !== undefined ? bedsheet : existing.bedsheet,
      pillow: pillow !== undefined ? pillow : existing.pillow,
      updatedBy: req.userId!,
      updatedAt: new Date(),
    }).where(eq(studentInventoryTable.studentId, studentId)).returning();
    res.json({ ...updated, lockedAt: updated.lockedAt?.toISOString() || null });
  } else {
    const [record] = await db.insert(studentInventoryTable).values({
      id: generateId(),
      studentId,
      hostelId: student.hostelId || "",
      mattress: mattress || false,
      bedsheet: bedsheet || false,
      pillow: pillow || false,
      messCard: false,
      inventoryLocked: false,
      updatedBy: req.userId!,
    }).returning();
    res.json({ ...record, lockedAt: null });
  }
});

// POST /api/attendance/inventory/:studentId/submit-item — submit (lock) a single inventory item
router.post("/inventory/:studentId/submit-item", requireVolunteer, async (req: AuthRequest, res) => {
  const { studentId } = req.params;
  const { item } = req.body; // "mattress" | "bedsheet" | "pillow"

  if (!["mattress", "bedsheet", "pillow"].includes(item)) {
    res.status(400).json({ message: "item must be mattress, bedsheet, or pillow" }); return;
  }

  const [student] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }

  const [existing] = await db.select().from(studentInventoryTable).where(eq(studentInventoryTable.studentId, studentId));

  const submittedField = `${item}Submitted` as "mattressSubmitted" | "bedsheetSubmitted" | "pillowSubmitted";

  if (existing?.[submittedField]) {
    res.json({ ...existing, lockedAt: existing.lockedAt?.toISOString() || null, alreadySubmitted: true });
    return;
  }

  const updateData: Record<string, any> = {
    [submittedField]: true,
    updatedBy: req.userId!,
    updatedAt: new Date(),
  };

  let record;
  if (existing) {
    // Check if all 3 will be submitted after this → auto-lock
    const allDone =
      (item === "mattress" || existing.mattressSubmitted) &&
      (item === "bedsheet" || existing.bedsheetSubmitted) &&
      (item === "pillow" || existing.pillowSubmitted);

    if (allDone) {
      updateData.inventoryLocked = true;
      updateData.lockedBy = req.userId!;
      updateData.lockedAt = new Date();
    }

    [record] = await db.update(studentInventoryTable)
      .set(updateData)
      .where(eq(studentInventoryTable.studentId, studentId))
      .returning();
  } else {
    // Create a new record with this item submitted
    const allDone = item === "mattress" && item === "bedsheet" && item === "pillow"; // impossible for single
    [record] = await db.insert(studentInventoryTable).values({
      id: generateId(),
      studentId,
      hostelId: student.hostelId || "",
      mattress: item === "mattress",
      bedsheet: item === "bedsheet",
      pillow: item === "pillow",
      mattressSubmitted: item === "mattress",
      bedsheetSubmitted: item === "bedsheet",
      pillowSubmitted: item === "pillow",
      messCard: false,
      inventoryLocked: false,
      updatedBy: req.userId!,
    }).returning();
  }

  res.json({ ...record, lockedAt: record.lockedAt?.toISOString() || null });
});

// POST /api/attendance/inventory/:studentId/submit — lock inventory permanently
router.post("/inventory/:studentId/submit", requireVolunteer, async (req: AuthRequest, res) => {
  const { studentId } = req.params;

  const [student] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }

  const [existing] = await db.select().from(studentInventoryTable).where(eq(studentInventoryTable.studentId, studentId));

  if (existing?.inventoryLocked) {
    res.json({ ...existing, lockedAt: existing.lockedAt?.toISOString() || null, alreadyLocked: true });
    return;
  }

  if (existing) {
    const [updated] = await db.update(studentInventoryTable).set({
      inventoryLocked: true,
      lockedBy: req.userId!,
      lockedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(studentInventoryTable.studentId, studentId)).returning();
    res.json({ ...updated, lockedAt: updated.lockedAt?.toISOString() || null });
  } else {
    const [record] = await db.insert(studentInventoryTable).values({
      id: generateId(),
      studentId,
      hostelId: student.hostelId || "",
      mattress: false,
      bedsheet: false,
      pillow: false,
      messCard: false,
      inventoryLocked: true,
      lockedBy: req.userId!,
      lockedAt: new Date(),
      updatedBy: req.userId!,
    }).returning();
    res.json({ ...record, lockedAt: record.lockedAt?.toISOString() || null });
  }
});

// PATCH /api/attendance/mess-card/:studentId — toggle mess card given
router.patch("/mess-card/:studentId", requireVolunteer, async (req: AuthRequest, res) => {
  const { studentId } = req.params;
  const { messCard } = req.body;

  const [student] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) { res.status(404).json({ message: "Student not found" }); return; }

  const [existing] = await db.select().from(studentInventoryTable).where(eq(studentInventoryTable.studentId, studentId));

  const newMessCard = messCard !== undefined ? messCard : (existing ? !existing.messCard : true);
  const now = new Date();
  const givenAt = newMessCard ? now : null;
  const revokedAt = newMessCard ? null : now;

  if (existing) {
    const [updated] = await db.update(studentInventoryTable).set({
      messCard: newMessCard,
      messCardGivenAt: givenAt,
      messCardRevokedAt: revokedAt,
      updatedBy: req.userId!,
      updatedAt: now,
    }).where(eq(studentInventoryTable.studentId, studentId)).returning();
    res.json({
      ...updated,
      lockedAt: updated.lockedAt?.toISOString() || null,
      messCardGivenAt: updated.messCardGivenAt?.toISOString() || null,
      messCardRevokedAt: updated.messCardRevokedAt?.toISOString() || null,
    });
  } else {
    const [record] = await db.insert(studentInventoryTable).values({
      id: generateId(),
      studentId,
      hostelId: student.hostelId || "",
      mattress: false,
      bedsheet: false,
      pillow: false,
      messCard: newMessCard,
      messCardGivenAt: givenAt,
      messCardRevokedAt: revokedAt,
      inventoryLocked: false,
      updatedBy: req.userId!,
    }).returning();
    res.json({
      ...record,
      lockedAt: null,
      messCardGivenAt: record.messCardGivenAt?.toISOString() || null,
      messCardRevokedAt: record.messCardRevokedAt?.toISOString() || null,
    });
  }
});

export default router;
