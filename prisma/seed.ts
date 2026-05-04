import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || "admin@cdf.com" },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || "admin@cdf.com",
      password: adminPassword,
      name: "Admin",
      role: "admin",
    },
  });

  console.log("Seeded admin user:", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
