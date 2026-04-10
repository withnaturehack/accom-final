import { Router } from "express";
import { db, usersTable, timeLogsTable, hostelsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin, requireVolunteer, generateId, AuthRequest } from "../lib/auth.js";

const router = Router();

const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function isOnline(lastActiveAt: Date | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < ACTIVE_THRESHOLD_MS;
}

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function scopedHostelIdsForCaller(caller: { role: string; hostelId?: string | null; assignedHostelIds?: string | null }) {
  if (caller.role === "superadmin") return null as string[] | null;
  if (caller.role === "volunteer") {
    const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
    if (assigned.length > 0) return Array.from(new Set(assigned));
    return caller.hostelId ? [caller.hostelId] : [];
  }
  const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
  if (assigned.length > 0) return Array.from(new Set(assigned));
  return caller.hostelId ? [caller.hostelId] : [];
}

function staffOverlapsScope(
  staff: { role: string; hostelId?: string | null; assignedHostelIds?: string | null },
  scopedIds: string[] | null,
) {
  if (!scopedIds) return true;
  if (scopedIds.length === 0) return false;
  const staffAssigned = parseAssignedHostelIds(staff.assignedHostelIds);
  const staffScope = new Set([...(staffAssigned || []), staff.hostelId || ""].filter(Boolean));
  for (const id of scopedIds) {
    if (staffScope.has(id)) return true;
  }
  return false;
}

// POST /api/staff/go-active — volunteer/staff marks themselves active
router.post("/go-active", requireVolunteer, async (req: AuthRequest, res) => {
  const { remark } = req.body || {};
  const now = new Date();
  const [user] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, req.userId!));

  await db.update(usersTable)
    .set({ lastActiveAt: now, isActive: true })
    .where(eq(usersTable.id, req.userId!));

  await db.insert(timeLogsTable).values({
    id: generateId(),
    userId: req.userId!,
    type: "active",
    note: remark || "Started shift",
    hostelId: user?.hostelId || null,
  });

  res.json({ status: "active", lastActiveAt: now.toISOString() });
});

// POST /api/staff/go-inactive — volunteer/staff marks themselves inactive
router.post("/go-inactive", requireVolunteer, async (req: AuthRequest, res) => {
  const { remark } = req.body || {};
  const [user] = await db.select({ hostelId: usersTable.hostelId }).from(usersTable).where(eq(usersTable.id, req.userId!));

  await db.update(usersTable)
    .set({ lastActiveAt: null })
    .where(eq(usersTable.id, req.userId!));

  await db.insert(timeLogsTable).values({
    id: generateId(),
    userId: req.userId!,
    type: "inactive",
    note: remark || "Ended shift",
    hostelId: user?.hostelId || null,
  });

  res.json({ status: "inactive" });
});

// POST /api/staff/heartbeat — update last active timestamp (call every 5 min)
router.post("/heartbeat", requireVolunteer, async (req: AuthRequest, res) => {
  await db.update(usersTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

// GET /api/staff/me-status — get own active status
router.get("/me-status", requireVolunteer, async (req: AuthRequest, res) => {
  const [user] = await db.select({ lastActiveAt: usersTable.lastActiveAt, isActive: usersTable.isActive })
    .from(usersTable).where(eq(usersTable.id, req.userId!));
  const online = isOnline(user?.lastActiveAt || null);
  res.json({ isActive: online, lastActiveAt: user?.lastActiveAt?.toISOString() || null });
});

// GET /api/staff/active-list — who is currently active (coordinator+)
router.get("/active-list", requireAdmin, async (req: AuthRequest, res) => {
  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scopedIds = scopedHostelIdsForCaller(caller);

  const roleWhere = sql`users.role IN ('volunteer','coordinator','admin','superadmin')`;

  const staff = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
    lastActiveAt: usersTable.lastActiveAt,
    hostelName: hostelsTable.name,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(sql`${roleWhere} AND last_active_at > NOW() - INTERVAL '10 minutes'`)
    .orderBy(desc(usersTable.lastActiveAt));

  const filtered = staff.filter((s) => staffOverlapsScope(s, scopedIds));
  res.json(filtered.map(s => ({ ...s, isOnline: true, lastActiveAt: s.lastActiveAt?.toISOString() || null })));
});

// GET /api/staff/logs — activity log with hostel-scoped filtering for coordinators
router.get("/logs", requireAdmin, async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const userId = req.query.userId as string | undefined;
  const hostelId = req.query.hostelId as string | undefined;

  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scopedIds = scopedHostelIdsForCaller(caller);

  let logs = await db.select({
    id: timeLogsTable.id,
    userId: timeLogsTable.userId,
    type: timeLogsTable.type,
    note: timeLogsTable.note,
    hostelId: timeLogsTable.hostelId,
    createdAt: timeLogsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userRole: usersTable.role,
    userHostelId: usersTable.hostelId,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(1000);

  if (scopedIds) {
    logs = logs.filter(l => scopedIds.includes(l.hostelId || l.userHostelId || ""));
  }
  if (userId) logs = logs.filter(l => l.userId === userId);
  if (hostelId) logs = logs.filter(l => l.hostelId === hostelId || l.userHostelId === hostelId);

  const page = logs.slice(offset, offset + limit);
  res.json(page.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

// GET /api/staff/all — all staff list with online status and hostel name (volunteer+)
router.get("/all", requireVolunteer, async (req: AuthRequest, res) => {
  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
    .from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  const scopedIds = scopedHostelIdsForCaller(caller);

  const roleWhere = sql`users.role IN ('volunteer','coordinator','admin','superadmin')`;

  const staff = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    lastActiveAt: usersTable.lastActiveAt,
    isActive: usersTable.isActive,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    area: usersTable.area,
    assignedHostelIds: usersTable.assignedHostelIds,
    hostelName: hostelsTable.name,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(roleWhere)
    .orderBy(usersTable.role, usersTable.name);

  const filtered = staff.filter((s) => staffOverlapsScope(s, scopedIds));
  res.json(filtered.map(s => ({
    ...s,
    isOnline: isOnline(s.lastActiveAt),
    lastActiveAt: s.lastActiveAt?.toISOString() || null,
  })));
});

// GET /api/staff/:staffId/logs — full log history for a specific staff member
router.get("/:staffId/logs", requireAdmin, async (req: AuthRequest, res) => {
  const { staffId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Number(req.query.offset) || 0;

  const [staffMember] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    lastActiveAt: usersTable.lastActiveAt,
    isActive: usersTable.isActive,
    phone: usersTable.phone,
    area: usersTable.area,
    hostelName: hostelsTable.name,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.id, staffId));

  if (!staffMember) { res.status(404).json({ message: "Staff member not found" }); return; }

  const logs = await db.select().from(timeLogsTable)
    .where(eq(timeLogsTable.userId, staffId))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    staff: { ...staffMember, isOnline: isOnline(staffMember.lastActiveAt), lastActiveAt: staffMember.lastActiveAt?.toISOString() || null },
    logs: logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    total: logs.length,
  });
});

export default router;
