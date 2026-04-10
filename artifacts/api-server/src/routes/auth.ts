import { Router } from "express";
import { db, usersTable, hostelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  generateId,
  generateToken,
  hashPassword,
  comparePassword,
  requireAuth,
  AuthRequest,
} from "../lib/auth.js";

const router = Router();

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function sanitizeString(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const email = sanitizeString(req.body?.email).toLowerCase();
    const password = sanitizeString(req.body?.password, 100);

    if (!email || !password) {
      return res.status(400).json({ error: "Bad Request", message: "Email and password required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Bad Request", message: "Invalid email format" });
    }

    const [row] = await db.select({
      user: usersTable,
      hostelName: hostelsTable.name,
    }).from(usersTable)
      .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
      .where(eq(usersTable.email, email));

    if (!row) {
      return res.status(401).json({ error: "Unauthorized", message: "User not found" });
    }
    const user = row.user;

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    }

    // Block pending users from logging in
    if (user.role === "pending") {
      return res.status(403).json({
        error: "Pending",
        message: "Your account is pending approval from the Super Admin. Please wait for approval before logging in.",
        isPending: true,
      });
    }

    const token = generateToken(user.id, user.role);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.rollNumber,
        hostelId: user.hostelId,
        hostelName: row.hostelName || null,
        roomNumber: user.roomNumber,
        phone: user.phone,
        contactNumber: user.contactNumber,
        area: user.area,
        assignedMess: user.assignedMess,
        assignedHostelIds: user.assignedHostelIds,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Something went wrong" });
  }
});

// POST /api/auth/register — sets role to "pending", no token issued
router.post("/register", async (req, res) => {
  try {
    const name = sanitizeString(req.body?.name, 100);
    const cleanEmail = sanitizeString(req.body?.email, 200).toLowerCase();
    const password = sanitizeString(req.body?.password, 100);
    const rollNumber = sanitizeString(req.body?.rollNumber, 50);

    if (!name || !cleanEmail || !password || !rollNumber) {
      return res.status(400).json({ error: "Bad Request", message: "All fields required" });
    }
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "Bad Request", message: "Invalid email format" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Bad Request", message: "Password must be at least 6 characters" });
    }
    if (name.length < 2) {
      return res.status(400).json({ error: "Bad Request", message: "Name must be at least 2 characters" });
    }

    const passwordHash = await hashPassword(password);
    const id = generateId();

    await db.insert(usersTable).values({
      id,
      name,
      email: cleanEmail,
      passwordHash,
      role: "pending",
      rollNumber,
      isActive: false,
    });

    return res.status(201).json({
      success: true,
      pending: true,
      message: "Registration successful! Your account is pending approval from the Super Admin. You will be notified once approved.",
    });
  } catch (err: any) {
    console.error("REGISTER ERROR:", err);
    if (err?.code === "23505") {
      return res.status(400).json({ error: "Conflict", message: "Email or roll number already registered" });
    }
    return res.status(500).json({ error: "Internal Server Error", message: "Something went wrong" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [row] = await db.select({
      user: usersTable,
      hostelName: hostelsTable.name,
    }).from(usersTable)
      .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
      .where(eq(usersTable.id, req.userId!));

    if (!row) {
      return res.status(404).json({ error: "Not Found", message: "User not found" });
    }
    const user = row.user;

    return res.json({
      success: true,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      rollNumber: user.rollNumber,
      hostelId: user.hostelId,
      hostelName: row.hostelName || null,
      roomNumber: user.roomNumber,
      phone: user.phone,
      contactNumber: user.contactNumber,
      area: user.area,
      assignedMess: user.assignedMess,
      assignedHostelIds: user.assignedHostelIds,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Something went wrong" });
  }
});

export default router;
