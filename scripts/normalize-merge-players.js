// Step B2: normalize Player.nameKey and merge spelling-variant duplicates.
//
// Why: the first backfill grouped participants by the exact name string, so
// "Côme Beaurain" and "Come Beaurain" became TWO Player rows for the same
// person. This script:
//   1. Backfills `nameKey` (accents/case/whitespace stripped) on every Player.
//   2. Groups Players by nameKey; groups with >1 row are duplicate candidates.
//   3. Within a group, Players with DIFFERENT non-empty emails are kept
//      separate (probably real homonyms). Players with no email merge into
//      the first Player carrying an email, or the oldest Player otherwise.
//   4. Merging = re-link all Participant rows to the kept Player, then delete
//      the duplicate Player row. Player is derived identity only — no match,
//      score or registration data is lost.
//
// Safe to re-run. Use --dry-run first to review the merge plan.
//
// Usage: node scripts/normalize-merge-players.js [--dry-run]
const { PrismaClient } = require("@prisma/client");

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

function normalizeNamePart(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
const nameKeyOf = (p) => `${normalizeNamePart(p.firstname)} ${normalizeNamePart(p.name)}`.trim();
const normEmail = (e) => (e || "").trim().toLowerCase();

(async () => {
  const players = await prisma.player.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`Players: ${players.length}`);

  // 1. Backfill nameKey
  let filled = 0;
  for (const p of players) {
    const key = nameKeyOf(p);
    if (p.nameKey !== key) {
      if (!DRY_RUN) await prisma.player.update({ where: { id: p.id }, data: { nameKey: key } });
      filled++;
    }
    p.nameKey = key; // in-memory for grouping below
  }
  console.log(`${DRY_RUN ? "[dry-run] would fill" : "Filled"} nameKey on ${filled} Player row(s).`);

  // 2. Group by nameKey
  const groups = new Map();
  for (const p of players) {
    if (!p.nameKey) continue;
    if (!groups.has(p.nameKey)) groups.set(p.nameKey, []);
    groups.get(p.nameKey).push(p);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Duplicate nameKey groups: ${dupGroups.length}`);

  let mergedPlayers = 0;
  let relinkedParticipants = 0;
  let keptSeparate = 0;

  for (const group of dupGroups) {
    // Partition: each distinct non-empty email = its own person; email-less
    // rows merge into the first player with an email (or the oldest player).
    const byEmail = new Map();
    const noEmail = [];
    for (const p of group) {
      const e = normEmail(p.email);
      if (e) {
        if (!byEmail.has(e)) byEmail.set(e, []);
        byEmail.get(e).push(p);
      } else noEmail.push(p);
    }

    if (byEmail.size > 1) {
      keptSeparate++;
      console.log(`  KEEP SEPARATE "${group[0].firstname} ${group[0].name}" — ${byEmail.size} distinct emails (${[...byEmail.keys()].join(", ")})`);
      // email-less rows still merge into the oldest partition's first player
      if (noEmail.length) {
        const target = [...byEmail.values()][0][0];
        noEmail.forEach((p) => byEmail.get(normEmail(target.email)).push(p));
      }
    } else {
      const only = byEmail.size === 1 ? [...byEmail.values()][0] : [];
      byEmail.clear();
      byEmail.set("__all__", [...only, ...noEmail]);
    }

    // Merge each partition: canonical = most participants (tie: oldest)
    for (const members of byEmail.values()) {
      if (members.length < 2) continue;
      const counts = await Promise.all(
        members.map((m) => prisma.participant.count({ where: { playerId: m.id } }))
      );
      const order = members.map((m, i) => ({ m, n: counts[i] })).sort((a, b) => b.n - a.n);
      const canonical = order[0].m;
      const dupes = order.slice(1).map((o) => o.m);
      console.log(`  MERGE "${canonical.firstname} ${canonical.name}" <${normEmail(canonical.email) || "no email"}> — keeping ${canonical.id}, merging ${dupes.length} duplicate(s)`);

      for (const dupe of dupes) {
        const n = await prisma.participant.count({ where: { playerId: dupe.id } });
        if (!DRY_RUN) {
          await prisma.$transaction(async (tx) => {
            await tx.participant.updateMany({ where: { playerId: dupe.id }, data: { playerId: canonical.id } });
            await tx.player.delete({ where: { id: dupe.id } });
          });
        }
        relinkedParticipants += n;
        mergedPlayers++;
      }
    }
  }

  console.log(`${DRY_RUN ? "[dry-run] would merge" : "Merged"} ${mergedPlayers} duplicate Player row(s), re-linked ${relinkedParticipants} participant(s).`);
  if (keptSeparate) console.log(`${keptSeparate} group(s) kept separate (distinct emails = probable homonyms).`);
  if (!DRY_RUN) console.log(`Players now: ${await prisma.player.count()}`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
