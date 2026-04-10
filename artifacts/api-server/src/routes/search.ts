import { Router } from "express";
import { db, usersTable, hostelsTable, attendanceTable, studentInventoryTable } from "@workspace/db";
import { eq, ilike, or, and } from "drizzle-orm";
import { requireAuth, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

const router = Router();

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

// GET /api/search?q=&limit=20&offset=0
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const q = ((req.query.q as string) || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  if (!q || q.length < 2) { res.json({ results: [], total: 0 }); return; }

  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }

  // Fetch all users and filter in JS (more flexible for search)
  let allUsers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    area: usersTable.area,
    hostelId: usersTable.hostelId,
    roomNumber: usersTable.roomNumber,
    assignedMess: usersTable.assignedMess,
    attendanceStatus: usersTable.attendanceStatus,
    isActive: usersTable.isActive,
  }).from(usersTable);

  // Role-based filtering
  if (caller.role === "volunteer") {
    allUsers = allUsers.filter(u => u.hostelId === caller.hostelId && u.role === "student");
  } else if (caller.role === "coordinator" || caller.role === "admin") {
    const assignedIds = parseAssignedHostelIds(caller.assignedHostelIds);
    const scoped = assignedIds.length > 0
      ? Array.from(new Set(assignedIds))
      : (caller.hostelId ? [caller.hostelId] : []);
    if (scoped.length === 0) {
      res.json({ results: [], total: 0, limit, offset });
      return;
    }
    allUsers = allUsers.filter(u => scoped.includes(u.hostelId || ""));
  } else if (caller.role === "student") {
    res.json({ results: [], total: 0 });
    return;
  }

  // Filter by search query
  const filtered = allUsers.filter(u =>
    (u.name || "").toLowerCase().includes(q) ||
    (u.email || "").toLowerCase().includes(q) ||
    (u.rollNumber || "").toLowerCase().includes(q) ||
    (u.roomNumber || "").toLowerCase().includes(q) ||
    (u.assignedMess || "").toLowerCase().includes(q) ||
    (u.area || "").toLowerCase().includes(q) ||
    (u.phone || "").toLowerCase().includes(q) ||
    (u.contactNumber || "").toLowerCase().includes(q)
  );

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  // Enrich with hostel names
  const hostelIds = [...new Set(paginated.map(u => u.hostelId).filter(Boolean) as string[])];
  const hostels = hostelIds.length > 0
    ? await db.select({ id: hostelsTable.id, name: hostelsTable.name }).from(hostelsTable)
    : [];
  const hostelMap: Record<string, string> = {};
  hostels.forEach(h => { hostelMap[h.id] = h.name; });

  const results = paginated.map(u => ({
    ...u,
    hostelName: hostelMap[u.hostelId || ""] || null,
  }));

  res.json({ results, total, limit, offset });
});

export default router;
