import { Router } from "express";
import { db, announcementsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireVolunteer, requireAdmin, generateId, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

const router = Router();

// GET /api/announcements
router.get("/", requireAuth, async (req, res) => {
  const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  const result = await Promise.all(
    announcements.map(async (a) => {
      const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, a.createdBy));
      return {
        id: a.id,
        title: a.title,
        content: a.content,
        category: a.category,
        createdBy: a.createdBy,
        createdByName: creator?.name || "Admin",
        createdAt: a.createdAt.toISOString(),
      };
    })
  );
  res.json(result);
});

// POST /api/announcements — volunteers send hostel-scoped; coordinators+ send global
router.post("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { title, content, category = "general" } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: "Bad Request", message: "title and content required" });
    return;
  }

  const [caller] = await db.select({ role: usersTable.role, hostelId: usersTable.hostelId, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, req.userId!));

  const isCoordPlus = COORDINATOR_ROLES.includes(caller?.role || "");

  const id = generateId();
  const [announcement] = await db
    .insert(announcementsTable)
    .values({ id, title, content, category, createdBy: req.userId! })
    .returning();

  // Coordinator+ notifies all students; volunteers notify only their hostel students
  const students = isCoordPlus
    ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student"))
    : await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.hostelId, caller?.hostelId || ""));

  const hostelStudents = students.filter(s => !isCoordPlus || true); // all for coord+

  if (hostelStudents.length > 0) {
    await db.insert(notificationsTable).values(
      hostelStudents.map((s) => ({
        id: generateId(),
        userId: s.id,
        title: `${caller?.name || "Staff"}: ${title}`,
        body: content.substring(0, 100),
        type: "announcement" as const,
        isRead: "false",
        refId: id,
      }))
    );
  }

  res.status(201).json({
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    category: announcement.category,
    createdBy: announcement.createdBy,
    createdByName: caller?.name || "Staff",
    createdAt: announcement.createdAt.toISOString(),
  });
});

// DELETE /api/announcements/:id
router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id));
  res.json({ success: true, message: "Deleted" });
});

export default router;
