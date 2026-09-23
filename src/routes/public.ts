import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

// Helper: format tournament from DB to frontend shape
function formatTournament(t: any) {
  return {
    id: t.id,
    name: t.name || "Unknown",
    logoUrl: t.logoUrl,
    eventDate: t.eventDate,
    createdAt: t.createdAt.toISOString(),
    status: t.status,
    format: t.format,
    size: t.size,
    currentRound: t.currentRound,
    maxRounds: t.maxRounds,
    qualifiedCount: t.qualifiedCount,
    qualifiedIds: t.qualifiedIds ? safeJsonParse(t.qualifiedIds) : undefined,
    participants: (t.participants || []).map((p: any) => ({
      id: p.id,
      firstname: p.firstname || "",
      name: p.name || "Unknown",
      email: p.email || "",
      phone: p.phone || "",
      score: p.score || 0,
    })),
    matches: (t.matches || []).map((m: any) => ({
      id: m.id,
      tournamentId: m.tournamentId,
      round: m.round,
      tableNumber: m.tableNumber,
      tableLabel: m.tableLabel,
      participantIds: safeJsonParse(m.participantIds) || [],
      results: safeJsonParse(m.results) || {},
      scorecards: m.scorecards ? safeJsonParse(m.scorecards) : undefined,
      isPendingReview: m.isPendingReview,
      isCompleted: m.isCompleted,
      isFinalist: m.isFinalist,
    })),
  };
}

// Helper: safe JSON parsing with fallback
function safeJsonParse(jsonString: string) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON parse error:", error, "Input:", jsonString);
    return null;
  }
}

// Corporations that were renamed after scorecards were submitted: map the old
// stored name to the current canonical name so stats stay consistent.
const CORPORATION_ALIASES: Record<string, string> = {
  "Tharsis Republic": "République de Tharsis",
  "Arcadian Communities": "Communautés Arcadiennes",
  "Interplanetary Cinematics": "Cinématiques Interplanétaires",
};
const canonicalCorporation = (name: string) => CORPORATION_ALIASES[name] ?? name;

// GET /api/public/stats - scorecard entries + metadata.
// Query filters (all optional): tournament, corporation, qualified=1,
// from/to (eventDate YYYY-MM-DD), organizer (ownerId), player (name search),
// meta=1 (dropdown metadata only, no entries).
router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { tournament, corporation, qualified, from, to, organizer, player, meta } = q;

    const tournaments = await prisma.tournament.findMany({
      include: { participants: true, owner: { select: { id: true, name: true } } },
    });

    const tournamentList = tournaments.map((t: (typeof tournaments)[number]) => ({
      id: t.id,
      name: t.name,
      eventDate: t.eventDate,
      status: t.status,
      ownerId: t.ownerId,
      ownerName: t.owner?.name || "",
    }));
    const organizers = Array.from(
      new Map(tournaments.map((t: (typeof tournaments)[number]) => [t.ownerId, t.owner?.name || ""])).entries()
    ).map(([id, name]) => ({ id, name }));

    // Lightweight mode: just the filter dropdown metadata.
    if (meta === "1") {
      res.json({ entries: [], tournaments: tournamentList, corporations: [], organizers, totalMatches: 0 });
      return;
    }

    // Push what we can into SQL via the tournament relation.
    const tournamentWhere: Record<string, any> = {};
    if (tournament) tournamentWhere.id = tournament;
    if (organizer) tournamentWhere.ownerId = organizer;
    if (from || to) {
      tournamentWhere.eventDate = {};
      if (from) tournamentWhere.eventDate.gte = from;
      if (to) tournamentWhere.eventDate.lte = to;
    }

    const matches = await prisma.match.findMany({
      where: {
        isCompleted: true,
        scorecards: { not: null },
        ...(Object.keys(tournamentWhere).length ? { tournament: tournamentWhere } : {}),
      },
      include: { tournament: { select: { eventDate: true } } },
    });

    const participantMap = new Map<string, { firstname: string; name: string; tournamentId: string; tournamentName: string }>();
    const qualifiedSet = new Set<string>();

    for (const t of tournaments) {
      for (const p of t.participants) {
        participantMap.set(p.id, {
          firstname: p.firstname || "",
          name: p.name || "",
          tournamentId: t.id,
          tournamentName: t.name,
        });
      }
      if (t.qualifiedIds) {
        const ids = safeJsonParse(t.qualifiedIds) as string[] | null;
        if (ids) ids.forEach((id: string) => qualifiedSet.add(id));
      }
    }

    const entries: Array<{
      participantId: string;
      firstname: string;
      name: string;
      tournamentId: string;
      tournamentName: string;
      eventDate: string;
      matchId: string;
      rank: number;
      corporation: string;
      nt: number;
      objectifs: number;
      recompenses: number;
      forets: number;
      villes: number;
      cartes: number;
      megacredits: number;
      totalScore: number;
      isQualified: boolean;
    }> = [];

    for (const match of matches) {
      if (!match.scorecards) continue;
      const scorecards = safeJsonParse(match.scorecards) as Record<string, any> | null;
      if (!scorecards) continue;

      // Rank players at the table by total score (tiebreak: megacredits),
      // same rule as the mobile scorecard page.
      const tableEntries = Object.entries(scorecards)
        .filter(([, sc]) => sc && typeof sc === "object" && sc.corporation && sc.corporation !== "Choisissez votre corporation")
        .map(([participantId, sc]) => {
          const total = (sc.nt || 0) + (sc.objectifs || 0) + (sc.recompenses || 0) + (sc.forets || 0) + (sc.villes || 0) + (sc.cartes || 0);
          return { participantId, sc, total, mc: sc.megacredits || 0 };
        })
        .sort((a, b) => (b.total !== a.total ? b.total - a.total : b.mc - a.mc));

      tableEntries.forEach(({ participantId, sc, total }, idx) => {
        const participant = participantMap.get(participantId);
        entries.push({
          participantId,
          firstname: participant?.firstname || "",
          name: participant?.name || "",
          tournamentId: participant?.tournamentId || match.tournamentId,
          tournamentName: participant?.tournamentName || "",
          eventDate: match.tournament?.eventDate || "",
          matchId: match.id,
          rank: idx + 1,
          corporation: canonicalCorporation(sc.corporation),
          nt: sc.nt || 0,
          objectifs: sc.objectifs || 0,
          recompenses: sc.recompenses || 0,
          forets: sc.forets || 0,
          villes: sc.villes || 0,
          cartes: sc.cartes || 0,
          megacredits: sc.megacredits || 0,
          totalScore: total,
          isQualified: qualifiedSet.has(participantId),
        });
      });
    }

    // Post-parse filters (JSON scorecards can't be filtered in SQL).
    let filtered = entries;
    if (corporation) {
      const corpFilter = canonicalCorporation(corporation);
      filtered = filtered.filter((e) => e.corporation === corpFilter);
    }
    if (qualified === "1" || qualified === "true") filtered = filtered.filter((e) => e.isQualified);
    if (player) {
      const needle = player.toLowerCase();
      filtered = filtered.filter((e) => `${e.firstname} ${e.name}`.toLowerCase().includes(needle));
    }

    const corporations = [...new Set(entries.map((e) => e.corporation))].sort();

    res.json({
      entries: filtered,
      tournaments: tournamentList,
      corporations,
      organizers,
      totalMatches: matches.length,
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/public/tournaments/:id - public tournament data (for QR code pages)
router.get("/tournaments/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    console.log("Public tournament request for ID:", id);
    
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { participants: true, matches: true },
    });

    console.log("Tournament found:", !!tournament);

    if (!tournament) {
      console.log("Tournament not found in database for ID:", id);
      res.status(404).json({ error: "Tournoi non trouvé" });
      return;
    }

    res.json(formatTournament(tournament));
  } catch (error) {
    console.error("Public get tournament error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/public/tournaments/:id/table/:tableId - submit scores from QR code (no auth)
router.post("/tournaments/:id/table/:tableId", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const tableId = req.params.tableId as string;
    const { results, scorecards } = req.body;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournoi non trouvé" });
      return;
    }

    const match = await prisma.match.findUnique({ where: { id: tableId } });
    if (!match || match.tournamentId !== id) {
      res.status(404).json({ error: "Table non trouvée" });
      return;
    }

    await prisma.match.update({
      where: { id: tableId },
      data: {
        results: JSON.stringify(results),
        scorecards: scorecards ? JSON.stringify(scorecards) : match.scorecards,
        isPendingReview: true,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Public submit scores error:", error);
    res.status(500).json({ error: "Erreur lors de la soumission" });
  }
});

export default router;
