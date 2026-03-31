import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// PUT /api/tournaments/:tournamentId/matches/:matchId - update a single match (scores submission)
router.put("/:tournamentId/matches/:matchId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournamentId = req.params.tournamentId as string;
    const matchId = req.params.matchId as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournoi non trouvé" });
      return;
    }

    if (req.user!.role !== "admin" && tournament.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Accès non autorisé" });
      return;
    }

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match || match.tournamentId !== tournamentId) {
      res.status(404).json({ error: "Match non trouvé" });
      return;
    }

    const { results, scorecards, isCompleted, isPendingReview } = req.body;

    const updated = await prisma.match.update({
      where: { id: matchId },
      data: {
        results: results ? JSON.stringify(results) : match.results,
        scorecards: scorecards ? JSON.stringify(scorecards) : match.scorecards,
        isCompleted: isCompleted !== undefined ? isCompleted : match.isCompleted,
        isPendingReview: isPendingReview !== undefined ? isPendingReview : match.isPendingReview,
      },
    });

    res.json({
      id: updated.id,
      tournamentId: updated.tournamentId,
      round: updated.round,
      tableNumber: updated.tableNumber,
      participantIds: JSON.parse(updated.participantIds),
      results: JSON.parse(updated.results),
      scorecards: updated.scorecards ? JSON.parse(updated.scorecards) : undefined,
      isPendingReview: updated.isPendingReview,
      isCompleted: updated.isCompleted,
    });
  } catch (error) {
    console.error("Update match error:", error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du match" });
  }
});

export default router;
