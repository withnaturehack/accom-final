import {
  db,
  usersTable,
  hostelsTable,
  announcementsTable,
  emergencyContactsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

async function seed() {
  console.log("🌱 Seeding database...");

  // Create hostels
  const existingHostels = await db.select().from(hostelsTable);
  let hostel1Id: string;
  let hostel2Id: string;

  if (existingHostels.length === 0) {
    hostel1Id = generateId();
    hostel2Id = generateId();
    await db.insert(hostelsTable).values([
      {
        id: hostel1Id,
        name: "Hostel Gurunath",
        location: "North Campus, IIT Madras",
        wardenName: "Dr. Ramesh Babu",
        wardenPhone: "+91 9876543210",
        totalRooms: 120,
      },
      {
        id: hostel2Id,
        name: "Hostel Godavari",
        location: "South Campus, IIT Madras",
        wardenName: "Dr. Meena Iyer",
        wardenPhone: "+91 9876543211",
        totalRooms: 90,
      },
    ]);
    console.log("✅ Hostels seeded");
  } else {
    hostel1Id = existingHostels[0].id;
    hostel2Id = existingHostels[1]?.id || hostel1Id;
    console.log("ℹ️  Hostels already exist");
  }

  // Create demo users
  const demoUsers = [
    {
      email: "student@iitm.ac.in",
      name: "Arjun Kumar",
      password: "123456",
      role: "student" as const,
      rollNumber: "21f3001234",
      hostelId: hostel1Id,
      roomNumber: "A-104",
    },
    {
      email: "admin@iitm.ac.in",
      name: "Admin IITM",
      password: "123456",
      role: "admin" as const,
    },
    {
      email: "superadmin@iitm.ac.in",
      name: "Super Admin",
      password: "123456",
      role: "superadmin" as const,
    },
  ];

  for (const u of demoUsers) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, u.email));
    if (!existing) {
      const id = generateId();
      await db.insert(usersTable).values({
        id,
        name: u.name,
        email: u.email,
        passwordHash: hashPassword(u.password),
        role: u.role,
        rollNumber: u.rollNumber,
        hostelId: u.hostelId,
        roomNumber: u.roomNumber,
      });
      console.log(`✅ Created ${u.role}: ${u.email}`);

      // Generate mess card for student
      if (u.role === "student") {
        const cardId = generateId();
        const qrCode = `CAMPUSOPS-${id}-${Date.now()}`;
        const validUntil = new Date();
        validUntil.setMonth(validUntil.getMonth() + 6);

        console.log(`✅ Generated mess card for ${u.email}`);
      }
    } else {
      console.log(`ℹ️  User already exists: ${u.email}`);
    }
  }

  // Create emergency contacts
  const existingContacts = await db.select().from(emergencyContactsTable);
  if (existingContacts.length === 0) {
    await db.insert(emergencyContactsTable).values([
      {
        id: generateId(),
        hostelId: hostel1Id,
        name: "Security Control Room",
        role: "Security",
        phone: "044-22578500",
        isAvailable24x7: "true",
      },
      {
        id: generateId(),
        hostelId: "",
        name: "Health Center",
        role: "Medical",
        phone: "044-22578430",
        isAvailable24x7: "true",
      },
      {
        id: generateId(),
        hostelId: "",
        name: "Dean of Students Office",
        role: "Administration",
        phone: "044-22578200",
        isAvailable24x7: "false",
      },
    ]);
    console.log("✅ Emergency contacts seeded");
  } else {
    console.log("ℹ️  Contacts already exist");
  }

  // Create sample announcements
  const existingAnnouncements = await db.select().from(announcementsTable);
  if (existingAnnouncements.length === 0) {
    const [admin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, "admin@iitm.ac.in"));
    if (admin) {
      await db.insert(announcementsTable).values([
        {
          id: generateId(),
          title: "Welcome to CampusOps!",
          content:
            "CampusOps is your centralized portal for hostel management, mess card tracking, lost & found, and campus announcements. Sign in with the demo credentials shown on the login screen.",
          category: "general",
          createdBy: admin.id,
        },
        {
          id: generateId(),
          title: "Mess Timing Update",
          content:
            "Breakfast: 7:00 AM - 9:00 AM | Lunch: 12:00 PM - 2:00 PM | Dinner: 7:00 PM - 9:30 PM. Please carry your mess card for scanning.",
          category: "hostel",
          createdBy: admin.id,
        },
        {
          id: generateId(),
          title: "Semester Registration Open",
          content:
            "BS program semester registration is now open. Last date for registration: March 25, 2026. Please complete your registration on the student portal.",
          category: "academic",
          createdBy: admin.id,
        },
      ]);
      console.log("✅ Sample announcements seeded");
    }
  } else {
    console.log("ℹ️  Announcements already exist");
  }

  console.log("🎉 Seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
