import { Router } from "express";
import { db, usersTable, studentInventoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin, AuthRequest } from "../lib/auth.js";

const router = Router();

// GET /api/approvals/pending — list all pending users
router.get("/pending", requireSuperAdmin, async (_req: AuthRequest, res) => {
  const pending = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.role, "pending"));

  res.json(pending.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })));
});

// GET /api/approvals/count — count of pending users (for badge)
router.get("/count", requireSuperAdmin, async (_req: AuthRequest, res) => {
  const pending = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "pending"));
  res.json({ count: pending.length });
});

// PATCH /api/approvals/:id/approve — approve user with role + optional hostel
router.patch("/:id/approve", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { role, hostelId, area } = req.body;

  const validRoles = ["student", "volunteer", "coordinator", "admin"];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ message: `Role must be one of: ${validRoles.join(", ")}` });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  if (user.role !== "pending") { res.status(400).json({ message: "User is not pending" }); return; }

  const [updated] = await db.update(usersTable).set({
    role,
    isActive: true,
    hostelId: hostelId || null,
    area: area || null,
  }).where(eq(usersTable.id, id)).returning();

  res.json({
    success: true,
    message: `User approved as ${role}`,
    user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, hostelId: updated.hostelId },
  });
});

// DELETE /api/approvals/:id/reject — reject and remove user
router.delete("/:id/reject", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  if (user.role !== "pending") { res.status(400).json({ message: "User is not pending" }); return; }

  await db.delete(studentInventoryTable).where(eq(studentInventoryTable.studentId, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));

  res.json({ success: true, message: "User rejected and removed" });
});

export default router;
