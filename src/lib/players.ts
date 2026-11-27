import prisma from "./prisma";
import { Prisma } from "@prisma/client";

type PrismaLike = Prisma.TransactionClient | typeof prisma;

export type PlayerLike = {
  firstname?: string;
  name?: string;
  pseudo?: string;
  email?: string;
  phone?: string;
};

// "Côme" / "Come" / " CÔME  " -> "come". Accents stripped, whitespace
// collapsed, lowercased — so spelling variants of the same person map to a
// single Player instead of silently duplicating.
export function normalizeNamePart(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function playerKeyOf(p: PlayerLike) {
  return `${normalizeNamePart(p.firstname || "")} ${normalizeNamePart(p.name || "")}`.trim();
}

const normEmail = (e?: string | null) => (e || "").trim().toLowerCase();

// Find (or create) the canonical Player for each participant payload.
// Returns a Map playerKey -> playerId.
//
// Matching rule, in order:
// 1. Same nameKey AND same email -> same person (a typo in the name with the
//    right email still links correctly).
// 2. Same nameKey, no email on either side -> same person (current behavior).
// 3. Same nameKey but different non-empty emails -> probably homonyms -> a
//    new Player is created rather than merging two different people.
export async function resolvePlayerIds(
  participants: PlayerLike[],
  client: PrismaLike = prisma
): Promise<Map<string, string>> {
  const uniques = new Map<string, Required<Pick<PlayerLike, "firstname" | "name">> & PlayerLike>();
  for (const p of participants) {
    const key = playerKeyOf(p);
    if (!key || uniques.has(key)) continue;
    uniques.set(key, { ...p, firstname: p.firstname || "", name: p.name || "" });
  }

  const map = new Map<string, string>();
  for (const [key, info] of uniques) {
    const email = normEmail(info.email);
    const candidates = await client.player.findMany({ where: { nameKey: key } });

    let player = email ? candidates.find((c) => normEmail(c.email) === email) : undefined;
    if (!player && candidates.length) {
      const withEmail = candidates.filter((c) => normEmail(c.email));
      if (!email || withEmail.length === 0) player = candidates[0];
      // email present but every candidate has a different non-empty email:
      // leave `player` undefined -> different person, create a new Player.
    }
    if (!player) {
      player = await client.player.create({
        data: {
          firstname: info.firstname,
          name: info.name,
          nameKey: key,
          pseudo: info.pseudo || null,
          email: info.email || null,
          phone: info.phone || null,
        },
      });
    }
    map.set(key, player.id);
  }
  return map;
}
