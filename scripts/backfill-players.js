// Backfill Participant.playerId from existing data — step 1 of separating
// "Player" (the person) from "Participant" (a tournament registration).
//
// Matching key: `${firstname} ${name}`.trim().toLowerCase() — intentionally
// the SAME key the stats page already uses (src/app/stats/page.tsx
// `playerKey`) so this is a pure formalization of the current behavior, not
// a silent re-merge/re-split of who counts as "the same player". Known
// limitation carried over on purpose: two different people with an identical
// name still merge into one Player here, same as today's stats page. That
// can be refined later (e.g. by email) without re-running this script blind.
//
// Safe to re-run: only touches rows where playerId IS NULL. Never deletes or
// modifies Participant's own firstname/name/email/phone/etc.
//
// Usage: node scripts/backfill-players.js [--dry-run]
const { PrismaClient } = require("@prisma/client");

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

function playerKey(p) {
  return `${p.firstname || ""} ${p.name || ""}`.trim().toLowerCase();
}

(async () => {
  const participants = await prisma.participant.findMany({
    where: { playerId: null },
    orderBy: { id: "asc" },
  });

  console.log(`Participants without playerId: ${participants.length}`);
  if (participants.length === 0) {
    console.log("Nothing to backfill.");
    await prisma.$disconnect();
    return;
  }

  // Group by the same name-based key the stats page already uses.
  const groups = new Map(); // key -> Participant[]
  for (const p of participants) {
    const key = playerKey(p);
    if (!key) continue; // skip rows with no usable name — left unlinked, flagged below
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const skipped = participants.filter((p) => !playerKey(p));
  if (skipped.length) {
    console.log(`WARNING: ${skipped.length} participant(s) have no usable name, left without a playerId:`);
    skipped.forEach((p) => console.log(`  - ${p.id} (tournament ${p.tournamentId})`));
  }

  console.log(`Distinct players to create/reuse: ${groups.size}`);

  let created = 0;
  let linked = 0;

  for (const [key, rows] of groups) {
    // Prefer the most complete values across all registrations under this name.
    const best = (field) => rows.map((r) => r[field]).find((v) => v && String(v).trim()) || null;

    let player = await prisma.player.findFirst({
      where: {
        firstname: { equals: rows[0].firstname, mode: "insensitive" },
        name: { equals: rows[0].name, mode: "insensitive" },
      },
    });

    if (!player) {
      if (!DRY_RUN) {
        player = await prisma.player.create({
          data: {
            firstname: rows[0].firstname,
            name: rows[0].name,
            pseudo: best("pseudo"),
            email: best("email"),
            phone: best("phone"),
          },
        });
      }
      created++;
    }

    if (!DRY_RUN && player) {
      await prisma.participant.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { playerId: player.id },
      });
    }
    linked += rows.length;
  }

  console.log(`${DRY_RUN ? "[dry-run] would create" : "Created"} ${created} Player row(s).`);
  console.log(`${DRY_RUN ? "[dry-run] would link" : "Linked"} ${linked} Participant row(s).`);

  // Verification: every non-skipped participant should now have a playerId.
  if (!DRY_RUN) {
    const stillNull = await prisma.participant.count({ where: { playerId: null } });
    console.log(`Participants still without playerId (expected = ${skipped.length}): ${stillNull}`);
    const totalParticipants = await prisma.participant.count();
    const totalPlayers = await prisma.player.count();
    console.log(`Totals — Participant: ${totalParticipants}, Player: ${totalPlayers}`);
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
