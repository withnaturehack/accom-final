import { Router, Request, Response } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db, usersTable, hostelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireSuperAdmin, generateId, AuthRequest } from "../lib/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function hashPassword(p: string) { return bcrypt.hashSync(p, 10); }

// POST /api/import/students — CSV with columns: name,email,rollNumber,phone,hostelName,roomNumber,assignedMess,area
router.post("/students", requireSuperAdmin, upload.single("file"), async (req: AuthRequest & Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const text = req.file.buffer.toString("utf8");
  let records: any[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    res.status(400).json({ error: "Invalid CSV", message: e.message });
    return;
  }

  const hostels = await db.select().from(hostelsTable);
  const hostelMap: Record<string, string> = {};
  hostels.forEach(h => { hostelMap[h.name.toLowerCase()] = h.id; });

  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of records) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email || !row.name) { errors.push(`Row missing name/email: ${JSON.stringify(row)}`); skipped++; continue; }

    const hostelId = hostelMap[(row.hostelName || "").toLowerCase()] || null;
    const password = row.password || "123456";

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));

    if (existing) {
      // Update existing student
      await db.update(usersTable).set({
        name: row.name || undefined,
        rollNumber: row.rollNumber || undefined,
        phone: row.phone || undefined,
        hostelId: hostelId || undefined,
        roomNumber: row.roomNumber || undefined,
        assignedMess: row.assignedMess || undefined,
        area: row.area || undefined,
        contactNumber: row.contactNumber || row.phone || undefined,
      }).where(eq(usersTable.id, existing.id));
      updated++;
    } else {
      await db.insert(usersTable).values({
        id: generateId(),
        name: row.name,
        email,
        passwordHash: hashPassword(password),
        role: "student",
        rollNumber: row.rollNumber || null,
        phone: row.phone || null,
        contactNumber: row.contactNumber || row.phone || null,
        hostelId,
        roomNumber: row.roomNumber || null,
        assignedMess: row.assignedMess || null,
        area: row.area || null,
        isActive: true,
        assignedHostelIds: "[]",
      });
      created++;
    }
  }

  res.json({ success: true, created, updated, skipped, errors: errors.slice(0, 10) });
});

// POST /api/import/mess-by-roll — CSV with columns: Roll no., Name of the Student, Allotted Mess
// Matches students by roll number. Creates if not found. Sets hostelId=null so all area admins can see them.
router.post("/mess-by-roll", requireSuperAdmin, upload.single("file"), async (req: AuthRequest & Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const text = req.file.buffer.toString("utf8");
  let records: any[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    res.status(400).json({ error: "Invalid CSV", message: e.message });
    return;
  }

  let updated = 0, created = 0, skipped = 0;
  const errors: string[] = [];

  const allStudents = await db.select({ id: usersTable.id, rollNumber: usersTable.rollNumber, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.role, "student"));
  const rollMap: Record<string, string> = {};
  allStudents.forEach(s => { if (s.rollNumber) rollMap[s.rollNumber.toLowerCase().trim()] = s.id; });

  for (const row of records) {
    const roll = (row["Roll no."] || row["roll_no"] || row["rollNumber"] || row["Roll No"] || "").trim();
    const name = (row["Name of the Student"] || row["name"] || row["Name"] || "").trim();
    const mess = (row["Allotted Mess"] || row["assignedMess"] || row["mess"] || "").trim();

    if (!roll || !mess) { skipped++; errors.push(`Row missing roll/mess: ${JSON.stringify(row)}`); continue; }

    const existingId = rollMap[roll.toLowerCase()];
    if (existingId) {
      await db.update(usersTable).set({
        assignedMess: mess,
        ...(name ? { name } : {}),
      }).where(eq(usersTable.id, existingId));
      updated++;
    } else {
      // Create new student with generated email from roll number
      const email = `${roll.toLowerCase()}@ds.study.iitm.ac.in`;
      const [alreadyEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
      if (alreadyEmail) {
        await db.update(usersTable).set({ assignedMess: mess, ...(name ? { name } : {}) }).where(eq(usersTable.id, alreadyEmail.id));
        updated++;
      } else {
        await db.insert(usersTable).values({
          id: generateId(),
          name: name || roll,
          email,
          passwordHash: hashPassword(roll),
          role: "student",
          rollNumber: roll,
          assignedMess: mess,
          hostelId: null,
          isActive: true,
          assignedHostelIds: "[]",
        });
        created++;
      }
    }
  }

  res.json({ success: true, updated, created, skipped, errors: errors.slice(0, 10) });
});

// POST /api/import/mess-by-roll-json — JSON body { rows: [{roll, name, mess}] }
router.post("/mess-by-roll-json", requireSuperAdmin, async (req: AuthRequest & Request, res: Response) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows array required" });
    return;
  }

  const allStudents = await db.select({ id: usersTable.id, rollNumber: usersTable.rollNumber })
    .from(usersTable).where(eq(usersTable.role, "student"));
  const rollMap: Record<string, string> = {};
  allStudents.forEach(s => { if (s.rollNumber) rollMap[s.rollNumber.toLowerCase().trim()] = s.id; });

  let updated = 0, created = 0, skipped = 0;

  for (const row of rows) {
    const roll = String(row.roll || "").trim();
    const name = String(row.name || "").trim();
    const mess = String(row.mess || "").trim();
    if (!roll || !mess) { skipped++; continue; }

    const existingId = rollMap[roll.toLowerCase()];
    if (existingId) {
      await db.update(usersTable).set({ assignedMess: mess, ...(name ? { name } : {}) }).where(eq(usersTable.id, existingId));
      updated++;
    } else {
      const email = `${roll.toLowerCase()}@ds.study.iitm.ac.in`;
      const [alreadyEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
      if (alreadyEmail) {
        await db.update(usersTable).set({ assignedMess: mess, ...(name ? { name } : {}) }).where(eq(usersTable.id, alreadyEmail.id));
        updated++;
      } else {
        await db.insert(usersTable).values({
          id: generateId(), name: name || roll, email,
          passwordHash: hashPassword(roll), role: "student",
          rollNumber: roll, assignedMess: mess, hostelId: null,
          isActive: true, assignedHostelIds: "[]",
        });
        created++;
      }
    }
  }
  res.json({ success: true, updated, created, skipped });
});

// POST /api/import/mess — CSV with columns: email,assignedMess
router.post("/mess", requireSuperAdmin, upload.single("file"), async (req: AuthRequest & Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const text = req.file.buffer.toString("utf8");
  let records: any[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    res.status(400).json({ error: "Invalid CSV", message: e.message });
    return;
  }

  let updated = 0, notFound = 0;
  for (const row of records) {
    const email = (row.email || row.Email || "").trim().toLowerCase();
    const mess = (row.assignedMess || row.mess || row.Mess || "").trim();
    if (!email || !mess) continue;

    const result = await db.update(usersTable).set({ assignedMess: mess }).where(eq(usersTable.email, email));
    if ((result.rowCount || 0) > 0) updated++; else notFound++;
  }

  res.json({ success: true, updated, notFound });
});

// POST /api/import/hostel-assignment — CSV with columns: email,hostelName,roomNumber
router.post("/hostel-assignment", requireSuperAdmin, upload.single("file"), async (req: AuthRequest & Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const text = req.file.buffer.toString("utf8");
  let records: any[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    res.status(400).json({ error: "Invalid CSV", message: e.message });
    return;
  }

  const hostels = await db.select().from(hostelsTable);
  const hostelMap: Record<string, string> = {};
  hostels.forEach(h => { hostelMap[h.name.toLowerCase()] = h.id; });

  let updated = 0, notFound = 0;
  for (const row of records) {
    const email = (row.email || row.Email || "").trim().toLowerCase();
    const hostelName = (row.hostelName || row.hostel || "").trim().toLowerCase();
    const roomNumber = (row.roomNumber || row.room || "").trim();
    if (!email) continue;

    const hostelId = hostelMap[hostelName] || null;
    const result = await db.update(usersTable)
      .set({ hostelId: hostelId || undefined, roomNumber: roomNumber || undefined })
      .where(eq(usersTable.email, email));
    if ((result.rowCount || 0) > 0) updated++; else notFound++;
  }

  res.json({ success: true, updated, notFound });
});

// GET /api/import/template/students — download sample CSV template
router.get("/template/students", requireSuperAdmin, (_req, res) => {
  const csv = "name,email,rollNumber,phone,hostelName,roomNumber,assignedMess,area,password\n" +
    "Arjun Kumar,arjun.kumar@iitm.ac.in,21f3001234,9876543210,Hostel Gurunath,A-101,Mess A,Computer Science,123456\n" +
    "Priya Sharma,priya.sharma@iitm.ac.in,21f3001235,9876543211,Hostel Godavari,B-202,Mess B,Data Science,123456";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=students-template.csv");
  res.send(csv);
});

// GET /api/import/template/mess — download mess allocation CSV template
router.get("/template/mess", requireSuperAdmin, (_req, res) => {
  const csv = "email,assignedMess\narjun.kumar@iitm.ac.in,Mess A\npriya.sharma@iitm.ac.in,Mess B";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=mess-template.csv");
  res.send(csv);
});

// GET /api/import/template/hostel-assignment — download hostel assignment CSV template
router.get("/template/hostel-assignment", requireSuperAdmin, (_req, res) => {
  const csv = "email,hostelName,roomNumber\narjun.kumar@iitm.ac.in,Hostel Gurunath,A-101\npriya.sharma@iitm.ac.in,Hostel Godavari,B-202";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=hostel-assignment-template.csv");
  res.send(csv);
});

export default router;
