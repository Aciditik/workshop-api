import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("i'Z1pzH$Vqi`Z)kS/9$d{_9]S", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@cdf.com" },
    update: {},
    create: {
      email: "admin@cdf.com",
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
