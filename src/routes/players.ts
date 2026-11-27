import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { normalizeNamePart } from "../lib/players";

const router = Router();

router.use(authenticate);

// GET /api/players/search?q=bea — suggest existing players while the
// organizer types in the add-player form. Normalized substring match on
// nameKey so "bea" finds "Côme Beaurain" regardless of accents/case.
router.get("/search", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (q.length < 2) {
      res.json({ players: [] });
      return;
    }
    const norm = normalizeNamePart(q);
    const players = await prisma.player.findMany({
      where: { nameKey: { contains: norm } },
      include: { _count: { select: { participants: true } } },
      orderBy: { participants: { _count: "desc" } },
      take: 10,
    });
    res.json({
      players: players.map((p) => ({
        id: p.id,
        firstname: p.firstname,
        name: p.name,
        pseudo: p.pseudo || undefined,
        email: p.email || "",
        phone: p.phone || "",
        tournamentCount: p._count.participants,
      })),
    });
  } catch (error) {
    console.error("Player search error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
