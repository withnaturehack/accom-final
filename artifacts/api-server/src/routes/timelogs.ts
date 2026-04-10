import { Router } from "express";
import { db, timeLogsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, generateId, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

const router = Router();

// POST /api/timelogs — log an event with optional remark
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { type, hostelId, note, remark } = req.body;
  const validTypes = ["login", "logout", "checkin", "entry", "active", "inactive", "custom"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ message: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }
  const [log] = await db.insert(timeLogsTable).values({
    id: generateId(),
    userId: req.userId!,
    hostelId: hostelId || null,
    type,
    note: note || remark || null,
  }).returning();
  res.status(201).json({ ...log, createdAt: log.createdAt.toISOString() });
});

// GET /api/timelogs — get logs with JOIN (no N+1)
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const isAdmin = COORDINATOR_ROLES.includes(req.userRole || "");

  const logs = await db.select({
    id: timeLogsTable.id,
    userId: timeLogsTable.userId,
    type: timeLogsTable.type,
    note: timeLogsTable.note,
    hostelId: timeLogsTable.hostelId,
    createdAt: timeLogsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userRole: usersTable.role,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .where(isAdmin ? undefined : eq(timeLogsTable.userId, req.userId!))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

// GET /api/timelogs/today — today's activity logs with JOIN
router.get("/today", requireAdmin, async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await db.select({
    id: timeLogsTable.id,
    userId: timeLogsTable.userId,
    type: timeLogsTable.type,
    note: timeLogsTable.note,
    createdAt: timeLogsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userRole: usersTable.role,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(200);

  const todayLogs = logs.filter(l => new Date(l.createdAt) >= today);
  res.json(todayLogs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

export default router;
