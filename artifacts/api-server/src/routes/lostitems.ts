import { Router } from "express";
import { db, lostItemsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, generateId, AuthRequest } from "../lib/auth.js";

const router = Router();

// GET /api/lostitems
router.get("/", requireAuth, async (req, res) => {
  const items = await db.select().from(lostItemsTable).orderBy(desc(lostItemsTable.createdAt));
  const result = await Promise.all(
    items.map(async (item) => {
      const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, item.reportedBy));
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        status: item.status,
        reportedBy: item.reportedBy,
        reportedByName: reporter?.name || "Unknown",
        location: item.location,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    })
  );
  res.json(result);
});

// GET /api/lostitems/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [item] = await db.select().from(lostItemsTable).where(eq(lostItemsTable.id, req.params.id));
  if (!item) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, item.reportedBy));
  res.json({
    id: item.id,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    status: item.status,
    reportedBy: item.reportedBy,
    reportedByName: reporter?.name || "Unknown",
    location: item.location,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

// POST /api/lostitems
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { title, description, imageUrl, location } = req.body;
  if (!title) {
    res.status(400).json({ error: "Bad Request", message: "Title required" });
    return;
  }

  const id = generateId();
  const [item] = await db
    .insert(lostItemsTable)
    .values({ id, title, description, imageUrl, status: "lost", reportedBy: req.userId!, location })
    .returning();

  const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  res.status(201).json({
    id: item.id,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    status: item.status,
    reportedBy: item.reportedBy,
    reportedByName: reporter?.name || "Unknown",
    location: item.location,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

// PATCH /api/lostitems/:id
router.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const { status, description } = req.body;
  const [existing] = await db.select().from(lostItemsTable).where(eq(lostItemsTable.id, req.params.id));
  if (!existing) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const updateData: any = { updatedAt: new Date() };
  if (status) updateData.status = status;
  if (description) updateData.description = description;

  const [item] = await db.update(lostItemsTable).set(updateData).where(eq(lostItemsTable.id, req.params.id)).returning();

  // Notify the reporter
  if (status && status !== existing.status) {
    const notifId = generateId();
    await db.insert(notificationsTable).values({
      id: notifId,
      userId: existing.reportedBy,
      title: `Lost Item Update: ${existing.title}`,
      body: `Your lost item "${existing.title}" has been marked as ${status}.`,
      type: "lostitem",
      isRead: "false",
      refId: existing.id,
    });
  }

  const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, item.reportedBy));
  res.json({
    id: item.id,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    status: item.status,
    reportedBy: item.reportedBy,
    reportedByName: reporter?.name || "Unknown",
    location: item.location,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

// DELETE /api/lostitems/:id
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [existing] = await db.select().from(lostItemsTable).where(eq(lostItemsTable.id, req.params.id));
  if (!existing) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  if (existing.reportedBy !== req.userId && req.userRole !== "admin" && req.userRole !== "superadmin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(lostItemsTable).where(eq(lostItemsTable.id, req.params.id));
  res.json({ success: true, message: "Deleted" });
});

export default router;
