import { Router } from "express";
import PDFDocument from "pdfkit";
import { db, usersTable, hostelsTable, attendanceTable, studentInventoryTable, timeLogsTable, checkinsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../lib/auth.js";

const router = Router();

function addHeader(doc: any, title: string) {
  doc.fontSize(20).fillColor("#1E6FD9").text("CampusOps — IIT Madras BS", { align: "center" });
  doc.fontSize(14).fillColor("#334155").text(title, { align: "center" });
  doc.fontSize(10).fillColor("#64748B").text(`Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, { align: "center" });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#E2E8F0").stroke();
  doc.moveDown(0.5);
}

// GET /api/pdf/students — PDF list of all students
router.get("/students", requireAdmin, async (_req, res) => {
  const students = await db.select({
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    room: usersTable.roomNumber,
    mess: usersTable.assignedMess,
    area: usersTable.area,
    hostelName: hostelsTable.name,
    attendance: usersTable.attendanceStatus,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=students.pdf");
  doc.pipe(res);

  addHeader(doc, `Students Report (${students.length} total)`);

  // Table
  const colW = [140, 90, 70, 70, 80, 80];
  const headers = ["Name", "Roll Number", "Room", "Mess", "Hostel", "Status"];
  let y = doc.y;
  let x = 50;

  // Header row
  doc.fontSize(9).fillColor("#1E40AF");
  headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
  doc.moveDown(0.5);
  y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#93C5FD").stroke();
  doc.moveDown(0.3);

  students.forEach((s, idx) => {
    if (doc.y > 750) { doc.addPage(); }
    y = doc.y;
    x = 50;
    const row = [s.name || "", s.rollNumber || "—", s.room || "—", s.mess || "—", s.hostelName || "—", s.attendance === "entered" ? "In ✓" : "Out"];
    doc.fontSize(8).fillColor(idx % 2 === 0 ? "#0F172A" : "#334155");
    row.forEach((val, i) => { doc.text(val, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
    doc.moveDown(0.5);
  });

  doc.end();
});

// GET /api/pdf/attendance — PDF attendance report for today
router.get("/attendance", requireAdmin, async (_req, res) => {
  const date = ((_req as any).query.date as string) || new Date().toISOString().split("T")[0];

  const records = await db.select({
    studentName: usersTable.name,
    rollNumber: usersTable.rollNumber,
    room: attendanceTable.roomNumber,
    mess: attendanceTable.mess,
    status: attendanceTable.status,
    hostelName: hostelsTable.name,
  }).from(attendanceTable)
    .leftJoin(usersTable, eq(attendanceTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(attendanceTable.hostelId, hostelsTable.id))
    .where(eq(attendanceTable.date, date));

  const entered = records.filter(r => r.status === "entered").length;
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=attendance-${date}.pdf`);
  doc.pipe(res);

  addHeader(doc, `Attendance Report — ${date}`);
  doc.fontSize(10).fillColor("#16A34A").text(`Entered: ${entered}/${records.length}`, { align: "right" });
  doc.moveDown(0.5);

  const colW = [140, 90, 70, 70, 80, 80];
  const headers = ["Student Name", "Roll Number", "Room", "Mess", "Hostel", "Status"];
  let y = doc.y;
  let x = 50;

  doc.fontSize(9).fillColor("#1E40AF");
  headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
  doc.moveDown(0.5);
  y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#93C5FD").stroke();
  doc.moveDown(0.3);

  records.forEach((r, idx) => {
    if (doc.y > 750) { doc.addPage(); }
    y = doc.y;
    x = 50;
    const color = r.status === "entered" ? "#15803D" : "#DC2626";
    const row = [r.studentName || "", r.rollNumber || "—", r.room || "—", r.mess || "—", r.hostelName || "—", r.status === "entered" ? "✓ In" : "✗ Out"];
    doc.fontSize(8);
    row.forEach((val, i) => {
      doc.fillColor(i === 5 ? color : (idx % 2 === 0 ? "#0F172A" : "#334155")).text(val, x, y, { width: colW[i], lineBreak: false });
      x += colW[i];
    });
    doc.moveDown(0.5);
  });

  doc.end();
});

// GET /api/pdf/activity-logs — PDF activity logs
router.get("/activity-logs", requireSuperAdmin, async (_req, res) => {
  const logs = await db.select({
    type: timeLogsTable.type,
    note: timeLogsTable.note,
    createdAt: timeLogsTable.createdAt,
    userName: usersTable.name,
    userRole: usersTable.role,
    userEmail: usersTable.email,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(500);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=activity-logs.pdf");
  doc.pipe(res);

  addHeader(doc, `Staff Activity Logs (${logs.length} entries)`);

  const colW = [120, 70, 80, 80, 140];
  const headers = ["Staff Name", "Role", "Action", "Time", "Remark"];
  let y = doc.y;
  let x = 50;

  doc.fontSize(9).fillColor("#1E40AF");
  headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
  doc.moveDown(0.5);
  y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#93C5FD").stroke();
  doc.moveDown(0.3);

  logs.forEach((l, idx) => {
    if (doc.y > 750) { doc.addPage(); }
    y = doc.y;
    x = 50;
    const time = new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
    const row = [l.userName || "Unknown", l.userRole || "—", l.type, time, l.note || "—"];
    doc.fontSize(7.5).fillColor(idx % 2 === 0 ? "#0F172A" : "#334155");
    row.forEach((val, i) => { doc.text(val, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
    doc.moveDown(0.5);
  });

  doc.end();
});

// GET /api/pdf/full-report — master PDF report
router.get("/full-report", requireSuperAdmin, async (_req, res) => {
  const students = await db.select({
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    room: usersTable.roomNumber,
    mess: usersTable.assignedMess,
    hostelName: hostelsTable.name,
    area: usersTable.area,
    attendance: usersTable.attendanceStatus,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=full-report.pdf");
  doc.pipe(res);

  addHeader(doc, "Full Campus Report");

  const entered = students.filter(s => s.attendance === "entered").length;
  doc.fontSize(11).fillColor("#0F172A");
  doc.text(`Total Students: ${students.length}  |  In Campus: ${entered}  |  Out: ${students.length - entered}`);
  doc.moveDown();

  students.forEach((s, idx) => {
    if (doc.y > 750) { doc.addPage(); }
    const y = doc.y;
    doc.fontSize(8).fillColor(idx % 2 === 0 ? "#0F172A" : "#334155");
    doc.text(
      `${s.name} | ${s.rollNumber || "—"} | ${s.hostelName || "—"} | Room: ${s.room || "—"} | Mess: ${s.mess || "—"} | ${s.attendance === "entered" ? "✓ In" : "✗ Out"}`,
      50, y, { lineBreak: true }
    );
  });

  doc.end();
});

// GET /api/pdf/checkins — PDF check-in/checkout report for today
router.get("/checkins", requireAdmin, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const rows = await db.select({
    studentName: usersTable.name,
    rollNumber: usersTable.rollNumber,
    hostelName: hostelsTable.name,
    room: usersTable.roomNumber,
    checkInTime: checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
    note: checkinsTable.note,
  }).from(checkinsTable)
    .leftJoin(usersTable, eq(checkinsTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(checkinsTable.hostelId, hostelsTable.id))
    .where(eq(checkinsTable.date, date))
    .orderBy(desc(checkinsTable.checkInTime));

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=checkins-${date}.pdf`);
  doc.pipe(res);

  addHeader(doc, `Campus Check-in Report — ${date} (${rows.length} entries)`);

  const colW = [120, 80, 110, 60, 110, 110];
  const headers = ["Student", "Roll No.", "Hostel", "Room", "Check-in Time", "Check-out Time"];
  let y = doc.y;
  let x = 50;

  doc.fontSize(9).fillColor("#1E40AF");
  headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
  doc.moveDown(0.5);
  y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#93C5FD").stroke();
  doc.moveDown(0.3);

  const fmt = (ts: Date | null) => ts
    ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" })
    : "—";

  rows.forEach((r, idx) => {
    if (doc.y > 750) { doc.addPage(); }
    y = doc.y;
    x = 50;
    const row = [
      r.studentName || "",
      r.rollNumber || "—",
      r.hostelName || "—",
      r.room || "—",
      fmt(r.checkInTime),
      r.checkOutTime ? fmt(r.checkOutTime) : "Still inside",
    ];
    doc.fontSize(8).fillColor(idx % 2 === 0 ? "#0F172A" : "#334155");
    row.forEach((val, i) => { doc.text(val, x, y, { width: colW[i], lineBreak: false }); x += colW[i]; });
    doc.moveDown(0.5);
  });

  doc.end();
});

export default router;
