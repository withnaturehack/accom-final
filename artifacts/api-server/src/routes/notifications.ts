import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

// GET /api/notifications
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.userId!))
    .orderBy(desc(notificationsTable.createdAt));

  res.json(
    notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      type: n.type,
      isRead: n.isRead === "true",
      refId: n.refId,
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

// PATCH /api/notifications/read-all — mark all as read for the user
router.patch("/read-all", requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(notificationsTable)
    .set({ isRead: "true" })
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.isRead, "false")));
  res.json({ success: true });
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: "true" })
    .where(eq(notificationsTable.id, req.params.id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.json({
    id: notification.id,
    userId: notification.userId,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    isRead: notification.isRead === "true",
    refId: notification.refId,
    createdAt: notification.createdAt.toISOString(),
  });
});

export default router;
