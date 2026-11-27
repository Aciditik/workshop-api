// Merge Player duplicates that share the same email AND have near-identical
// nameKeys (Levenshtein ≤ 2) — the typo case normalize-merge-players.js
// intentionally skips (e.g. "Mathieu CORRADINI" vs "Mathieu CORADINI" with
// the same email). Same email + clearly different names = siblings sharing
// a parent's email, those groups are skipped, never merged.
//
// For each group: the canonical Player is the one with the most participants
// (tie: oldest createdAt); missing pseudo/phone on the canonical row are
// filled from the duplicates; all participants are re-linked, then the
// duplicate Player rows are deleted. Player is derived identity only — no
// match/score/registration data is touched.
//
// Usage:
//   node scripts/merge-players-by-email.js --dry-run   (review the plan)
//   node scripts/merge-players-by-email.js             (apply)
const { PrismaClient } = require("@prisma/client");

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const normEmail = (e) => (e || "").trim().toLowerCase();

// Levenshtein distance — same email alone isn't proof of same person
// (siblings can share a parent's email). We only merge same-email Players
// whose nameKeys are ≤2 edits apart, i.e. an obvious spelling typo like
// "corradini"/"coradini", never genuinely different names.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

(async () => {
  const players = await prisma.player.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { participants: true } } },
  });

  // Group by normalized email (non-empty only), then keep only groups where
  // every member's nameKey is within 2 edits of the "most participants" one.
  const byEmail = new Map();
  for (const p of players) {
    const e = normEmail(p.email);
    if (!e) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(p);
  }

  const groups = [];
  let skipped = 0;
  for (const [email, group] of byEmail) {
    if (new Set(group.map((p) => p.nameKey)).size < 2) continue;
    const sorted = [...group].sort((a, b) => b._count.participants - a._count.participants);
    const canonical = sorted[0];
    const close = sorted.filter((p) => levenshtein(p.nameKey || "", canonical.nameKey || "") <= 2);
    const far = sorted.filter((p) => levenshtein(p.nameKey || "", canonical.nameKey || "") > 2);
    if (far.length) {
      skipped += far.length;
      console.log(`  SKIP "${email}" — "${far.map((p) => `${p.firstname} ${p.name}`).join('", "')}" too different from "${canonical.firstname} ${canonical.name}" (shared email, different people?)`);
    }
    if (close.length > 1) groups.push([email, close]);
  }
  console.log(`Email-shared groups with typo-variant nameKeys: ${groups.length}`);

  let merged = 0;
  let relinked = 0;

  for (const [email, group] of groups) {
    const sorted = [...group].sort((a, b) => b._count.participants - a._count.participants);
    const canonical = sorted[0];
    const dupes = sorted.slice(1);
    console.log(`  MERGE ${email}`);
    console.log(`    KEEP  "${canonical.firstname} ${canonical.name}" (${canonical._count.participants} participants)`);
    dupes.forEach((d) => console.log(`    MERGE "${d.firstname} ${d.name}" (${d._count.participants} participants)`));

    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        // Fill gaps on the canonical row from duplicate data, then re-link.
        const fill = {};
        if (!canonical.pseudo) { const v = dupes.map((d) => d.pseudo).find(Boolean); if (v) fill.pseudo = v; }
        if (!canonical.phone) { const v = dupes.map((d) => d.phone).find(Boolean); if (v) fill.phone = v; }
        if (Object.keys(fill).length) {
          await tx.player.update({ where: { id: canonical.id }, data: fill });
        }
        for (const dupe of dupes) {
          await tx.participant.updateMany({ where: { playerId: dupe.id }, data: { playerId: canonical.id } });
          await tx.player.delete({ where: { id: dupe.id } });
        }
      });
    }
    merged += dupes.length;
    relinked += dupes.reduce((n, d) => n + d._count.participants, 0);
  }

  console.log(`${DRY_RUN ? "[dry-run] would merge" : "Merged"} ${merged} Player row(s), re-linked ${relinked} participant(s).`);
  if (!DRY_RUN) console.log(`Players now: ${await prisma.player.count()}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
