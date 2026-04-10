import { Router } from "express";
import { db, usersTable, hostelsTable, studentInventoryTable, checkinsTable } from "@workspace/db";
import { and, eq, inArray, ilike, or, count, desc, isNull } from "drizzle-orm";
import { requireAuth, requireAdmin, requireVolunteer, generateId, hashPassword, AuthRequest } from "../lib/auth.js";
import { parse } from "csv-parse/sync";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const router = Router();

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

type HostelSheetStudent = {
  rollNumber: string | null;
  name: string | null;
  gender: string | null;
  allottedHostel: string | null;
  roomNumber: string | null;
  allottedMess: string | null;
  remarks: string | null;
  mobileNumber: string | null;
  emergencyContact: string | null;
  age: string | null;
  email: string | null;
  dsEs: string | null;
};

let cachedCsvPath: string | null = null;
let cachedCsvMtimeMs = -1;
let cachedCsvByEmail = new Map<string, HostelSheetStudent>();
let cachedCsvByRoll = new Map<string, HostelSheetStudent>();

function normalizeText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normalizeEmail(v: unknown): string {
  return normalizeText(v).toLowerCase();
}

function resolveHostelSheetPath(): string | null {
  const envPath = process.env.HOSTEL_DATA_CSV_PATH;
  const candidates = [
    envPath,
    path.resolve(process.cwd(), "attached_assets", "hostels  - Sheet2.csv"),
    path.resolve(process.cwd(), "..", "attached_assets", "hostels  - Sheet2.csv"),
    path.resolve(process.cwd(), "..", "..", "attached_assets", "hostels  - Sheet2.csv"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function toStudentCsvRow(raw: Record<string, unknown>): HostelSheetStudent {
  return {
    rollNumber: normalizeText(raw["Roll no."]) || null,
    name: normalizeText(raw["Name of the Student"]) || null,
    gender: normalizeText(raw["Gender"]) || null,
    allottedHostel: normalizeText(raw["Allotted Hostel"]) || null,
    roomNumber: normalizeText(raw["Room no."]) || null,
    allottedMess: normalizeText(raw["Allotted Mess"]) || null,
    remarks: normalizeText(raw["Remarks"]) || null,
    mobileNumber: normalizeText(raw["Mobile no."]) || null,
    emergencyContact: normalizeText(raw["Emergency contact"]) || null,
    age: normalizeText(raw["Age"]) || null,
    email: normalizeEmail(raw["Email"]) || null,
    dsEs: normalizeText(raw["DS/ES"]) || null,
  };
}

async function ensureHostelSheetCache() {
  const csvPath = resolveHostelSheetPath();
  if (!csvPath) {
    cachedCsvPath = null;
    cachedCsvMtimeMs = -1;
    cachedCsvByEmail = new Map();
    cachedCsvByRoll = new Map();
    return;
  }

  let mtimeMs = -1;
  try {
    mtimeMs = statSync(csvPath).mtimeMs;
  } catch {
    return;
  }

  if (cachedCsvPath === csvPath && cachedCsvMtimeMs === mtimeMs) return;

  try {
    const text = await readFile(csvPath, "utf8");
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[];
    const byEmail = new Map<string, HostelSheetStudent>();
    const byRoll = new Map<string, HostelSheetStudent>();

    for (const raw of records) {
      const row = toStudentCsvRow(raw);
      if (row.email) byEmail.set(row.email, row);
      if (row.rollNumber) byRoll.set(row.rollNumber.toLowerCase(), row);
    }

    cachedCsvPath = csvPath;
    cachedCsvMtimeMs = mtimeMs;
    cachedCsvByEmail = byEmail;
    cachedCsvByRoll = byRoll;
  } catch {
    // Keep API resilient even if CSV parsing fails.
  }
}

async function getCsvSupplement(email?: string | null, rollNumber?: string | null): Promise<HostelSheetStudent | null> {
  await ensureHostelSheetCache();
  const em = normalizeEmail(email);
  const rn = normalizeText(rollNumber).toLowerCase();
  return (em && cachedCsvByEmail.get(em)) || (rn && cachedCsvByRoll.get(rn)) || null;
}

// GET /api/students — volunteers see only their hostel, coordinators/admins see assigned hostels
router.get("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { limit = "100", offset = "0", search = "", hostelId: qHostelId, page } = req.query;

  const [caller] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Resolve page -> offset
  const lim = Math.min(Number(limit), 5000);
  const off = page ? (Number(page) - 1) * lim : Number(offset);

  const q = (search as string).trim();

  // Build hostel scope filter
  let hostelFilter: string[] | null = null; // null = all

  if (caller.role === "volunteer") {
    if (!caller.hostelId) {
      res.json({ students: [], total: 0, page: off / lim + 1, limit: lim });
      return;
    }
    hostelFilter = [caller.hostelId];
  } else if (caller.role === "coordinator" || caller.role === "admin") {
    const assignedIds = parseAssignedHostelIds(caller.assignedHostelIds);
    const scoped = assignedIds.length > 0
      ? Array.from(new Set(assignedIds))
      : (caller.hostelId ? [caller.hostelId] : []);
    if (scoped.length === 0) {
      res.json({ students: [], total: 0, page: off / lim + 1, limit: lim });
      return;
    }
    hostelFilter = scoped;
  }

  // Additional hostelId filter from query param
  if (qHostelId) {
    const qh = qHostelId as string;
    if (!hostelFilter || hostelFilter.includes(qh)) {
      hostelFilter = [qh];
    } else {
      res.json({ students: [], total: 0, page: off / lim + 1, limit: lim });
      return;
    }
  }

  // Build where conditions
  const isAreaAdmin = caller.role === "coordinator" || caller.role === "admin";
  const conditions: any[] = [eq(usersTable.role, "student")];
  if (hostelFilter) {
    // Area admins also see students with no hostel assigned (mess-only students)
    if (isAreaAdmin && !qHostelId) {
      conditions.push(or(inArray(usersTable.hostelId, hostelFilter), isNull(usersTable.hostelId)));
    } else {
      conditions.push(inArray(usersTable.hostelId, hostelFilter));
    }
  }
  if (q) {
    conditions.push(
      or(
        ilike(usersTable.name, `%${q}%`),
        ilike(usersTable.email, `%${q}%`),
        ilike(usersTable.rollNumber, `%${q}%`),
        ilike(usersTable.roomNumber, `%${q}%`),
        ilike(usersTable.assignedMess, `%${q}%`),
        ilike(usersTable.area, `%${q}%`),
        ilike(usersTable.hostelId, `%${q}%`),
      )
    );
  }

  const whereClause = and(...conditions);

  // Count total matching
  const [{ total }] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(whereClause);

  // Fetch paginated results
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      rollNumber: usersTable.rollNumber,
      phone: usersTable.phone,
      contactNumber: usersTable.contactNumber,
      area: usersTable.area,
      hostelId: usersTable.hostelId,
      roomNumber: usersTable.roomNumber,
      assignedMess: usersTable.assignedMess,
      attendanceStatus: usersTable.attendanceStatus,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      hostelName: hostelsTable.name,
    })
    .from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(whereClause)
    .orderBy(usersTable.name)
    .limit(lim)
    .offset(off);

  const studentIds = rows.map(s => s.id);

  const inventoryRows = studentIds.length
    ? await db.select({
        studentId: studentInventoryTable.studentId,
        messCard: studentInventoryTable.messCard,
        messCardGivenAt: studentInventoryTable.messCardGivenAt,
        messCardRevokedAt: studentInventoryTable.messCardRevokedAt,
      }).from(studentInventoryTable).where(inArray(studentInventoryTable.studentId, studentIds))
    : [];

  const checkinRows = studentIds.length
    ? await db.select({
        studentId: checkinsTable.studentId,
        checkInTime: checkinsTable.checkInTime,
        checkOutTime: checkinsTable.checkOutTime,
      }).from(checkinsTable).where(and(
        inArray(checkinsTable.studentId, studentIds),
        eq(checkinsTable.date, todayStr()),
      ))
    : [];

  const inventoryMap = new Map(inventoryRows.map(r => [r.studentId, r]));
  const checkinMap = new Map<string, { checkInTime: Date | null; checkOutTime: Date | null }>();
  for (const row of checkinRows) {
    const prev = checkinMap.get(row.studentId);
    if (!prev || (row.checkInTime?.getTime() || 0) >= (prev.checkInTime?.getTime() || 0)) {
      checkinMap.set(row.studentId, { checkInTime: row.checkInTime, checkOutTime: row.checkOutTime });
    }
  }

  const students = await Promise.all(rows.map(async (s) => {
    const inv = inventoryMap.get(s.id);
    const checkin = checkinMap.get(s.id);
    const csv = await getCsvSupplement(s.email, s.rollNumber);
    return {
      ...s,
      messCard: !!inv?.messCard,
      messCardGivenAt: inv?.messCardGivenAt?.toISOString() || null,
      messCardRevokedAt: inv?.messCardRevokedAt?.toISOString() || null,
      checkInTime: checkin?.checkInTime?.toISOString() || null,
      checkOutTime: checkin?.checkOutTime?.toISOString() || null,
      gender: csv?.gender || null,
      allottedHostel: csv?.allottedHostel || s.hostelName || null,
      allottedMess: csv?.allottedMess || s.assignedMess || null,
      remarks: csv?.remarks || null,
      mobileNumber: csv?.mobileNumber || s.contactNumber || s.phone || null,
      emergencyContact: csv?.emergencyContact || null,
      age: csv?.age || null,
      dsEs: csv?.dsEs || null,
      createdAt: s.createdAt.toISOString(),
    };
  }));

  // Support both legacy (array) and new (paginated object) consumers
  res.json({ students, total: Number(total), page: Math.floor(off / lim) + 1, limit: lim });
});

// GET /api/students/:id/checkins-history
router.get("/:id/checkins-history", requireAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const rows = await db.select({
    id: checkinsTable.id,
    date: checkinsTable.date,
    checkInTime: checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
    note: checkinsTable.note,
    hostelId: checkinsTable.hostelId,
    createdAt: checkinsTable.createdAt,
  }).from(checkinsTable)
    .where(eq(checkinsTable.studentId, req.params.id))
    .orderBy(desc(checkinsTable.checkInTime))
    .limit(limit);

  res.json(rows.map((r) => ({
    ...r,
    checkInTime: r.checkInTime?.toISOString() || null,
    checkOutTime: r.checkOutTime?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// GET /api/students/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [student] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      rollNumber: usersTable.rollNumber,
      phone: usersTable.phone,
      contactNumber: usersTable.contactNumber,
      area: usersTable.area,
      hostelId: usersTable.hostelId,
      roomNumber: usersTable.roomNumber,
      assignedMess: usersTable.assignedMess,
      attendanceStatus: usersTable.attendanceStatus,
      createdAt: usersTable.createdAt,
      hostelName: hostelsTable.name,
    })
    .from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(and(eq(usersTable.id, req.params.id), eq(usersTable.role, "student")));

  if (!student) { res.status(404).json({ error: "Not Found" }); return; }

  const [inv] = await db.select({
    messCard: studentInventoryTable.messCard,
    messCardGivenAt: studentInventoryTable.messCardGivenAt,
    messCardRevokedAt: studentInventoryTable.messCardRevokedAt,
  }).from(studentInventoryTable).where(eq(studentInventoryTable.studentId, req.params.id));

  const [todayCheckin] = await db.select({
    checkInTime: checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
  }).from(checkinsTable).where(and(
    eq(checkinsTable.studentId, req.params.id),
    eq(checkinsTable.date, todayStr()),
  ));

  const csv = await getCsvSupplement(student.email, student.rollNumber);

  res.json({
    ...student,
    messCard: !!inv?.messCard,
    messCardGivenAt: inv?.messCardGivenAt?.toISOString() || null,
    messCardRevokedAt: inv?.messCardRevokedAt?.toISOString() || null,
    checkInTime: todayCheckin?.checkInTime?.toISOString() || null,
    checkOutTime: todayCheckin?.checkOutTime?.toISOString() || null,
    gender: csv?.gender || null,
    allottedHostel: csv?.allottedHostel || student.hostelName || null,
    allottedMess: csv?.allottedMess || student.assignedMess || null,
    remarks: csv?.remarks || null,
    mobileNumber: csv?.mobileNumber || student.contactNumber || student.phone || null,
    emergencyContact: csv?.emergencyContact || null,
    age: csv?.age || null,
    dsEs: csv?.dsEs || null,
    createdAt: student.createdAt.toISOString(),
  });
});

// POST /api/students
router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const { name, email, password, rollNumber, hostelId, roomNumber, phone, contactNumber, area, assignedMess } = req.body;
  if (!name || !email || !password || !rollNumber) {
    res.status(400).json({ error: "Bad Request", message: "Required fields missing" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(400).json({ error: "Bad Request", message: "Email already registered" });
    return;
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ id, name, email: email.toLowerCase(), passwordHash, role: "student", rollNumber, hostelId, roomNumber, phone, contactNumber, area, assignedMess })
    .returning();

  const hostelName = hostelId
    ? (await db.select({ name: hostelsTable.name }).from(hostelsTable).where(eq(hostelsTable.id, hostelId)))[0]?.name ?? null
    : null;

  res.status(201).json({
    id: user.id, name: user.name, email: user.email,
    rollNumber: user.rollNumber, hostelId: user.hostelId, hostelName,
    roomNumber: user.roomNumber, createdAt: user.createdAt.toISOString(),
  });
});

// PATCH /api/students/:id — update student details
router.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const { hostelId, roomNumber, assignedMess, attendanceStatus, phone, contactNumber, area } = req.body;
  const [user] = await db
    .update(usersTable)
    .set({
      ...(hostelId !== undefined && { hostelId }),
      ...(roomNumber !== undefined && { roomNumber }),
      ...(assignedMess !== undefined && { assignedMess }),
      ...(attendanceStatus !== undefined && { attendanceStatus }),
      ...(phone !== undefined && { phone }),
      ...(contactNumber !== undefined && { contactNumber }),
      ...(area !== undefined && { area }),
    })
    .where(eq(usersTable.id, req.params.id))
    .returning();

  if (!user) { res.status(404).json({ message: "Student not found" }); return; }
  res.json(user);
});

export default router;
