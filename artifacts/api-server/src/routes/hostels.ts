import { Router } from "express";
import { db, hostelsTable, emergencyContactsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, generateId, AuthRequest } from "../lib/auth.js";

const router = Router();

// GET /api/hostels
router.get("/", requireAuth, async (req, res) => {
  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, (req as AuthRequest).userId!));

  if (!caller) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let hostels;
  if (caller.role === "superadmin") {
    hostels = await db.select().from(hostelsTable);
  } else if (caller.role === "volunteer" || caller.role === "student") {
    if (!caller.hostelId) {
      res.json([]);
      return;
    }
    hostels = await db.select().from(hostelsTable).where(eq(hostelsTable.id, caller.hostelId));
  } else {
    const assigned = JSON.parse(caller.assignedHostelIds || "[]") as string[];
    const scoped = assigned.length > 0
      ? Array.from(new Set(assigned.filter(Boolean)))
      : [caller.hostelId || ""].filter(Boolean);
    if (scoped.length === 0) {
      res.json([]);
      return;
    }
    hostels = await db.select().from(hostelsTable).where(inArray(hostelsTable.id, scoped));
  }

  res.json(hostels.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

// GET /api/hostels/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, (req as AuthRequest).userId!));

  if (!caller) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (caller.role !== "superadmin") {
    const scoped = caller.role === "volunteer" || caller.role === "student"
      ? [caller.hostelId || ""].filter(Boolean)
      : (() => {
        const assigned = JSON.parse(caller.assignedHostelIds || "[]") as string[];
        return assigned.length > 0
          ? Array.from(new Set(assigned.filter(Boolean)))
          : [caller.hostelId || ""].filter(Boolean);
      })();

    if (!scoped.includes(req.params.id)) {
      res.status(403).json({ error: "Forbidden", message: "Hostel not in your assigned scope" });
      return;
    }
  }

  const [hostel] = await db.select().from(hostelsTable).where(eq(hostelsTable.id, req.params.id));
  if (!hostel) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  res.json({ ...hostel, createdAt: hostel.createdAt.toISOString() });
});

// POST /api/hostels
router.post("/", requireAdmin, async (req, res) => {
  const { name, location, totalRooms, wardenName, wardenPhone } = req.body;
  if (!name) {
    res.status(400).json({ error: "Bad Request", message: "Name required" });
    return;
  }

  const id = generateId();
  const [hostel] = await db
    .insert(hostelsTable)
    .values({ id, name, location, totalRooms, wardenName, wardenPhone })
    .returning();

  res.status(201).json({ ...hostel, createdAt: hostel.createdAt.toISOString() });
});

// GET /api/hostel/contacts
router.get("/contacts/mine", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user?.hostelId) {
    res.json([]);
    return;
  }
  const contacts = await db.select().from(emergencyContactsTable).where(eq(emergencyContactsTable.hostelId, user.hostelId));
  res.json(contacts.map(c => ({ ...c, isAvailable24x7: c.isAvailable24x7 === "true", createdAt: undefined })));
});

export default router;
