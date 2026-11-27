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

// Same key used by scripts/backfill-players.js and the stats-page fallback:
// `${firstname} ${name}`.trim().toLowerCase(). Keep in sync with both.
export function playerKeyOf(p: PlayerLike) {
  return `${p.firstname || ""} ${p.name || ""}`.trim().toLowerCase();
}

// Find (or create) the canonical Player for each participant payload.
// Returns a Map playerKey -> playerId. Reuses the same lookup rule as the
// backfill so a player registered in a new tournament links to the existing
// Player row instead of drifting to a NULL playerId.
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
    let player = await client.player.findFirst({
      where: {
        firstname: { equals: info.firstname, mode: "insensitive" },
        name: { equals: info.name, mode: "insensitive" },
      },
    });
    if (!player) {
      player = await client.player.create({
        data: {
          firstname: info.firstname,
          name: info.name,
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
