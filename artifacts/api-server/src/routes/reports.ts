import { Router } from "express";
import {
  db,
  usersTable,
  hostelsTable,
  lostItemsTable,
  announcementsTable,
  timeLogsTable,
} from "@workspace/db";
import { eq, count, or, sql, inArray, and } from "drizzle-orm";
import {
  requireSuperAdmin,
  requireAdmin,
  generateId,
  hashPassword,
  AuthRequest,
} from "../lib/auth.js";

const router = Router();

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

// GET /api/reports/summary
router.get("/summary", requireAdmin, async (req: AuthRequest, res) => {
  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const scopedHostelIds = caller.role === "superadmin"
    ? null
    : (() => {
      const assigned = parseAssignedHostelIds(caller.assignedHostelIds);
      return assigned.length > 0
        ? Array.from(new Set(assigned))
        : (caller.hostelId ? [caller.hostelId] : []);
    })();

  if (scopedHostelIds && scopedHostelIds.length === 0) {
    res.json({
      totalStudents: 0,
      totalHostels: 0,
      totalLostItems: 0,
      foundItems: 0,
      totalAnnouncements: 0,
      recentActivity: [],
    });
    return;
  }

  const [studentsCount] = scopedHostelIds
    ? await db.select({ count: count() }).from(usersTable).where(and(eq(usersTable.role, "student"), inArray(usersTable.hostelId, scopedHostelIds)))
    : await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "student"));

  const [hostelsCount] = scopedHostelIds
    ? [{ count: scopedHostelIds.length } as { count: number }]
    : await db.select({ count: count() }).from(hostelsTable);
  const [announcementsCount] = await db.select({ count: count() }).from(announcementsTable);
  const lostItems = await db.select({ status: lostItemsTable.status }).from(lostItemsTable);
  const foundItems = lostItems.filter(i => i.status === "found" || i.status === "claimed").length;

  res.json({
    totalStudents: Number(studentsCount.count),
    totalHostels: Number(hostelsCount.count),
    totalLostItems: lostItems.length,
    foundItems,
    totalAnnouncements: Number(announcementsCount.count),
    recentActivity: [],
  });
});

// GET /api/admin/admin-users — list ALL staff (volunteers, coordinators, admins, superadmins)
router.get("/admin-users", requireSuperAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      phone: usersTable.phone,
      area: usersTable.area,
      hostelId: usersTable.hostelId,
      assignedHostelIds: usersTable.assignedHostelIds,
      lastActiveAt: usersTable.lastActiveAt,
      createdAt: usersTable.createdAt,
      hostelName: hostelsTable.name,
    })
    .from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(
      sql`${usersTable.role} IN ('volunteer','coordinator','admin','superadmin')`
    )
    .orderBy(usersTable.role, usersTable.name);

  res.json(users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    phone: u.phone,
    area: u.area,
    hostelId: u.hostelId,
    hostelName: u.hostelName,
    assignedHostelIds: JSON.parse(u.assignedHostelIds || "[]"),
    lastActiveAt: u.lastActiveAt?.toISOString() || null,
    createdAt: u.createdAt.toISOString(),
  })));
});

// POST /api/admin/admin-users — create any staff account (volunteer/coordinator/admin/superadmin)
router.post("/admin-users", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { name, email, password, role, hostelId, assignedHostelIds, phone, area } = req.body;
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "Bad Request", message: "Name, email, password, and role are required" });
    return;
  }
  const allowed = ["volunteer", "coordinator", "admin", "superadmin"];
  if (!allowed.includes(role)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid role" });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(400).json({ error: "Conflict", message: "Email already registered" });
    return;
  }
  const id = generateId();
  const passwordHash = await hashPassword(password);
  const ids = Array.isArray(assignedHostelIds) ? assignedHostelIds : [];
  const [user] = await db.insert(usersTable)
    .values({
      id, name, email: email.toLowerCase(), passwordHash, role,
      hostelId: hostelId || null,
      assignedHostelIds: JSON.stringify(ids),
      phone: phone || null,
      area: area || null,
      isActive: true,
    })
    .returning();
  res.status(201).json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    hostelId: user.hostelId, assignedHostelIds: JSON.parse(user.assignedHostelIds || "[]"),
    createdAt: user.createdAt.toISOString(),
  });
});

// PATCH /api/admin/admin-users/:id — update staff details
router.patch("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { name, hostelId, assignedHostelIds, phone, area, role } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (hostelId !== undefined) updates.hostelId = hostelId || null;
  if (assignedHostelIds !== undefined) updates.assignedHostelIds = JSON.stringify(Array.isArray(assignedHostelIds) ? assignedHostelIds : []);
  if (phone !== undefined) updates.phone = phone;
  if (area !== undefined) updates.area = area;
  if (role !== undefined) updates.role = role;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.params.id)).returning();
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  res.json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    hostelId: user.hostelId, assignedHostelIds: JSON.parse(user.assignedHostelIds || "[]"),
  });
});

// POST /api/admin/reset-password/:id — superadmin sets a new password for any staff member
router.post("/reset-password/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    res.status(400).json({ error: "Bad Request", message: "Password must be at least 4 characters" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [user] = await db.update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, req.params.id))
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  res.json({ success: true, id: user.id, name: user.name, email: user.email });
});

// DELETE /api/admin/admin-users/:id
router.delete("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
  res.json({ success: true });
});

// PATCH /api/admin/assign-hostel/:id — assign hostel(s) to a staff member
router.patch("/assign-hostel/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { hostelId, assignedHostelIds, area } = req.body;
  const [before] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.params.id));

  if (!before) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const updates: Record<string, any> = {};

  if (hostelId !== undefined) updates.hostelId = hostelId || null;
  if (assignedHostelIds !== undefined) {
    updates.assignedHostelIds = JSON.stringify(Array.isArray(assignedHostelIds) ? assignedHostelIds : []);
  }
  if (area !== undefined) updates.area = area || null;

  // Volunteers are single-hostel operationally; keep history trail in assignedHostelIds list.
  if (before.role === "volunteer" && hostelId !== undefined) {
    const prev = JSON.parse(before.assignedHostelIds || "[]") as string[];
    const merged = Array.from(new Set([...prev, before.hostelId || "", hostelId || ""].filter(Boolean)));
    updates.assignedHostelIds = JSON.stringify(merged);
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.params.id)).returning();
  if (!user) { res.status(404).json({ message: "User not found" }); return; }

  await db.insert(timeLogsTable).values({
    id: generateId(),
    userId: req.params.id,
    hostelId: user.hostelId || null,
    type: "assignment",
    note: JSON.stringify({
      changedBy: req.userId,
      from: {
        hostelId: before.hostelId,
        assignedHostelIds: JSON.parse(before.assignedHostelIds || "[]"),
      },
      to: {
        hostelId: user.hostelId,
        assignedHostelIds: JSON.parse(user.assignedHostelIds || "[]"),
        area: user.area,
      },
      changedAt: new Date().toISOString(),
    }),
  });

  res.json({
    id: user.id, name: user.name, role: user.role,
    hostelId: user.hostelId,
    assignedHostelIds: JSON.parse(user.assignedHostelIds || "[]"),
    area: user.area,
  });
});

export default router;
