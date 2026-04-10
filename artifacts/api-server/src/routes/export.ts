import { Router } from "express";
import { db, usersTable, hostelsTable, attendanceTable, studentInventoryTable, timeLogsTable, checkinsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../lib/auth.js";

const router = Router();

function toCSV(rows: Record<string, any>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col] ?? "";
      const str = String(val).replace(/"/g, '""');
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

// GET /api/export/students.csv — single efficient query
router.get("/students.csv", requireAdmin, async (_req, res) => {
  const students = await db.select({
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    room: usersTable.roomNumber,
    mess: usersTable.assignedMess,
    attendance: usersTable.attendanceStatus,
    area: usersTable.area,
    hostelName: hostelsTable.name,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const csv = toCSV(students.map(s => ({
    ...s,
    hostelName: s.hostelName || "",
    createdAt: s.createdAt?.toISOString() || "",
  })), ["name", "email", "rollNumber", "phone", "contactNumber", "room", "mess", "attendance", "area", "hostelName", "createdAt"]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=students.csv");
  res.send(csv);
});

// GET /api/export/attendance.csv?date= — JOIN-based, no N+1
router.get("/attendance.csv", requireAdmin, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const records = await db.select({
    studentName: usersTable.name,
    rollNumber: usersTable.rollNumber,
    room: attendanceTable.roomNumber,
    mess: attendanceTable.mess,
    status: attendanceTable.status,
    hostelName: hostelsTable.name,
    date: attendanceTable.date,
  }).from(attendanceTable)
    .leftJoin(usersTable, eq(attendanceTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(attendanceTable.hostelId, hostelsTable.id))
    .where(eq(attendanceTable.date, date));

  const csv = toCSV(records.map(r => ({
    ...r,
    studentName: r.studentName || "",
    rollNumber: r.rollNumber || "",
    room: r.room || "",
    mess: r.mess || "",
    hostelName: r.hostelName || "",
  })), ["studentName", "rollNumber", "room", "mess", "status", "hostelName", "date"]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=attendance-${date}.csv`);
  res.send(csv);
});

// GET /api/export/inventory.csv — JOIN-based, no N+1
router.get("/inventory.csv", requireAdmin, async (_req, res) => {
  const records = await db.select({
    name: usersTable.name,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    hostelName: hostelsTable.name,
    mattress: studentInventoryTable.mattress,
    bedsheet: studentInventoryTable.bedsheet,
    pillow: studentInventoryTable.pillow,
    updatedAt: studentInventoryTable.updatedAt,
  }).from(studentInventoryTable)
    .leftJoin(usersTable, eq(studentInventoryTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(studentInventoryTable.hostelId, hostelsTable.id));

  const csv = toCSV(records.map(r => ({
    name: r.name || "",
    rollNumber: r.rollNumber || "",
    phone: r.phone || "",
    hostelName: r.hostelName || "",
    mattress: r.mattress ? "Yes" : "No",
    bedsheet: r.bedsheet ? "Yes" : "No",
    pillow: r.pillow ? "Yes" : "No",
    updatedAt: r.updatedAt?.toISOString() || "",
  })), ["name", "rollNumber", "phone", "hostelName", "mattress", "bedsheet", "pillow", "updatedAt"]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
  res.send(csv);
});

// GET /api/export/full-report.csv — master JOIN-based export
router.get("/full-report.csv", requireSuperAdmin, async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const students = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    room: usersTable.roomNumber,
    mess: usersTable.assignedMess,
    hostelName: hostelsTable.name,
    area: usersTable.area,
    isActive: usersTable.isActive,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const attendance = await db.select({ studentId: attendanceTable.studentId, status: attendanceTable.status })
    .from(attendanceTable).where(eq(attendanceTable.date, today));

  const inventory = await db.select({
    studentId: studentInventoryTable.studentId,
    mattress: studentInventoryTable.mattress,
    bedsheet: studentInventoryTable.bedsheet,
    pillow: studentInventoryTable.pillow,
  }).from(studentInventoryTable);

  const attMap: Record<string, string> = {};
  attendance.forEach(a => { attMap[a.studentId] = a.status; });
  const invMap: Record<string, typeof inventory[0]> = {};
  inventory.forEach(i => { invMap[i.studentId] = i; });

  const rows = students.map(s => ({
    name: s.name,
    email: s.email,
    rollNumber: s.rollNumber || "",
    phone: s.phone || s.contactNumber || "",
    room: s.room || "",
    mess: s.mess || "",
    hostel: s.hostelName || "",
    area: s.area || "",
    active: s.isActive ? "Yes" : "No",
    attendance: attMap[s.id] || "not_marked",
    mattress: invMap[s.id]?.mattress ? "Yes" : "No",
    bedsheet: invMap[s.id]?.bedsheet ? "Yes" : "No",
    pillow: invMap[s.id]?.pillow ? "Yes" : "No",
  }));

  const csv = toCSV(rows, ["name", "email", "rollNumber", "phone", "room", "mess", "hostel", "area", "active", "attendance", "mattress", "bedsheet", "pillow"]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=full-report.csv");
  res.send(csv);
});

// GET /api/export/timelogs — staff activity log export
router.get("/timelogs", requireAdmin, async (_req, res) => {
  const logs = await db.select({
    id: timeLogsTable.id,
    type: timeLogsTable.type,
    note: timeLogsTable.note,
    hostelId: timeLogsTable.hostelId,
    createdAt: timeLogsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userRole: usersTable.role,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(1000);

  const rows = logs.map(l => ({
    staffName: l.userName || "",
    email: l.userEmail || "",
    role: l.userRole || "",
    action: l.type,
    remark: l.note || "",
    timestamp: new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  }));
  const csv = toCSV(rows, ["staffName", "email", "role", "action", "remark", "timestamp"]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=activity-logs.csv");
  res.send(csv);
});

// GET /api/export/checkins.csv — today's check-in/checkout records
router.get("/checkins.csv", requireAdmin, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const rows = await db.select({
    studentName: usersTable.name,
    rollNumber: usersTable.rollNumber,
    email: usersTable.email,
    hostelName: hostelsTable.name,
    room: usersTable.roomNumber,
    checkInTime: checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
    note: checkinsTable.note,
    date: checkinsTable.date,
  }).from(checkinsTable)
    .leftJoin(usersTable, eq(checkinsTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(checkinsTable.hostelId, hostelsTable.id))
    .where(eq(checkinsTable.date, date))
    .orderBy(desc(checkinsTable.checkInTime));

  const data = rows.map(r => ({
    studentName: r.studentName || "",
    rollNumber: r.rollNumber || "",
    email: r.email || "",
    hostelName: r.hostelName || "",
    room: r.room || "",
    checkInTime: r.checkInTime ? new Date(r.checkInTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
    checkOutTime: r.checkOutTime ? new Date(r.checkOutTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not checked out",
    note: r.note || "",
    date: r.date,
  }));

  const csv = toCSV(data, ["studentName", "rollNumber", "email", "hostelName", "room", "checkInTime", "checkOutTime", "note", "date"]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=checkins-${date}.csv`);
  res.send(csv);
});

export default router;
