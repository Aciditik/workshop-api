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

// GET /api/public/stats - raw scorecard entries + metadata for client-side filtering
router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const matches = await prisma.match.findMany({
      where: { isCompleted: true, scorecards: { not: null } },
    });

    const tournaments = await prisma.tournament.findMany({
      include: { participants: true },
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

      for (const [participantId, sc] of Object.entries(scorecards)) {
        if (!sc || typeof sc !== "object") continue;
        if (!sc.corporation || sc.corporation === "Choisissez votre corporation") continue;

        const nt = sc.nt || 0;
        const objectifs = sc.objectifs || 0;
        const recompenses = sc.recompenses || 0;
        const forets = sc.forets || 0;
        const villes = sc.villes || 0;
        const cartes = sc.cartes || 0;
        const megacredits = sc.megacredits || 0;

        const participant = participantMap.get(participantId);
        entries.push({
          participantId,
          firstname: participant?.firstname || "",
          name: participant?.name || "",
          tournamentId: participant?.tournamentId || match.tournamentId,
          tournamentName: participant?.tournamentName || "",
          corporation: sc.corporation,
          nt,
          objectifs,
          recompenses,
          forets,
          villes,
          cartes,
          megacredits,
          totalScore: nt + objectifs + recompenses + forets + villes + cartes,
          isQualified: qualifiedSet.has(participantId),
        });
      }
    }

    const tournamentList = tournaments.map((t) => ({ id: t.id, name: t.name }));
    const corporations = [...new Set(entries.map((e) => e.corporation))].sort();

    res.json({
      entries,
      tournaments: tournamentList,
      corporations,
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
