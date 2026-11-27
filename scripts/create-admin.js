// Create (or promote to) an admin account.
// Usage: node scripts/create-admin.js <email> <password> [name]
// Requires DATABASE_URL in .env. Idempotent — safe to re-run.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const [email, password, name = "Super Admin"] = process.argv.slice(2);
if (!email || !password) {
    console.error("Usage: node scripts/create-admin.js <email> <password> [name]");
    process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword, role: "admin" },
        create: { email, name, password: hashedPassword, role: "admin" },
    });
    console.log(`OK — ${user.email} (${user.role}), id ${user.id}`);
    await prisma.$disconnect();
})().catch(async (e) => {
    console.error("Error:", e.message);
    await prisma.$disconnect();
    process.exit(1);
});
