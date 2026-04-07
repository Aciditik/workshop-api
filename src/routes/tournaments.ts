import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// All tournament routes require authentication
router.use(authenticate);

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
    ownerId: t.ownerId,
    participants: (t.participants || []).map((p: any) => ({
      id: p.id,
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

// GET /api/tournaments - list tournaments (filtered by role)
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where = req.user!.role === "admin" ? {} : { ownerId: req.user!.id };

    const tournaments = await prisma.tournament.findMany({
      where,
      include: { participants: true, matches: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(tournaments.map(formatTournament));
  } catch (error) {
    console.error("List tournaments error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/tournaments/:id
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    console.log("Authenticated tournament request for ID:", id, "User:", req.user?.id);
    
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

    // Check ownership (admins can see all)
    if (req.user!.role !== "admin" && tournament.ownerId !== req.user!.id) {
      console.log("Access denied - User:", req.user!.id, "Owner:", tournament.ownerId);
      res.status(403).json({ error: "Accès non autorisé" });
      return;
    }

    res.json(formatTournament(tournament));
  } catch (error) {
    console.error("Get tournament error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/tournaments
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, name, logoUrl, eventDate, size, format, maxRounds, qualifiedCount, status, currentRound, participants, matches, ownerId } = req.body;
    
    console.log("Creating tournament with data:", { 
      name, 
      eventDate, 
      size, 
      userId: req.user?.id,
      userRole: req.user?.role 
    });

    // Validate required fields
    if (!name || !eventDate || size == null) {
      console.log("Missing required fields:", { name: !!name, eventDate: !!eventDate, size: !!size });
      res.status(400).json({ error: "Champs requis: nom, date, taille" });
      return;
    }

    // Admin can assign tournament to another user; organizers always own their own
    const effectiveOwnerId = (req.user!.role === "admin" && ownerId) ? ownerId : req.user!.id;
    
    console.log("Effective owner ID:", effectiveOwnerId);

    const tournament = await prisma.tournament.create({
      data: {
        id: id || undefined,
        name,
        logoUrl,
        eventDate,
        size,
        format: format || "swiss",
        maxRounds: maxRounds || 3,
        qualifiedCount: qualifiedCount || 2,
        status: status || "draft",
        currentRound: currentRound || 0,
        ownerId: effectiveOwnerId,
      },
    });

    console.log("Tournament created successfully:", tournament.id);

    // Create participants if provided
    if (participants && participants.length > 0) {
      await prisma.participant.createMany({
        data: participants.map((p: any) => ({
          id: p.id,
          name: p.name,
          email: p.email || null,
          phone: p.phone || null,
          score: p.score || 0,
          tournamentId: tournament.id,
        })),
      });
    }

    // Create matches if provided
    if (matches && matches.length > 0) {
      await prisma.match.createMany({
        data: matches.map((m: any) => ({
          id: m.id,
          tournamentId: tournament.id,
          round: m.round,
          tableNumber: m.tableNumber,
          tableLabel: m.tableLabel || null,
          participantIds: JSON.stringify(m.participantIds),
          results: JSON.stringify(m.results || {}),
          scorecards: m.scorecards ? JSON.stringify(m.scorecards) : null,
          isPendingReview: m.isPendingReview || false,
          isCompleted: m.isCompleted || false,
          isFinalist: m.isFinalist || false,
        })),
      });
    }

    const created = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true },
    });

    if (!created) {
      res.status(500).json({ error: "Tournoi créé mais introuvable" });
      return;
    }

    res.status(201).json(formatTournament(created));
  } catch (error) {
    console.error("Create tournament error:", error);
    res.status(500).json({ error: "Erreur lors de la création" });
  }
});

// PUT /api/tournaments/:id - full update (participants, matches, status, etc.)
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: "Tournoi non trouvé" });
      return;
    }

    if (req.user!.role !== "admin" && existing.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Accès non autorisé" });
      return;
    }

    const { name, logoUrl, eventDate, status, size, currentRound, format, maxRounds, qualifiedCount, qualifiedIds, participants, matches } = req.body;

    // Update tournament base fields
    await prisma.tournament.update({
      where: { id },
      data: {
        name,
        logoUrl,
        eventDate,
        status,
        size,
        currentRound,
        format,
        maxRounds,
        qualifiedCount,
        qualifiedIds: qualifiedIds ? JSON.stringify(qualifiedIds) : null,
      },
    });

    // Sync participants: use transaction to prevent race conditions
    // Only update participants if explicitly provided and not empty
    if (participants && participants.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.participant.deleteMany({ where: { tournamentId: id } });
        await tx.participant.createMany({
          data: participants.map((p: any) => ({
            id: p.id,
            name: p.name || "Unknown",
            email: p.email || null,
            phone: p.phone || null,
            score: p.score || 0,
            tournamentId: id,
          })),
        });
      });
    }

    // Sync matches: use transaction to prevent race conditions
    // Only update matches if explicitly provided and not empty
    if (matches && matches.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.match.deleteMany({ where: { tournamentId: id } });
        await tx.match.createMany({
          data: matches.map((m: any) => ({
            id: m.id,
            tournamentId: id,
            round: m.round,
            tableNumber: m.tableNumber,
            tableLabel: m.tableLabel || null,
            participantIds: JSON.stringify(m.participantIds || []),
            results: JSON.stringify(m.results || {}),
            scorecards: m.scorecards ? JSON.stringify(m.scorecards) : null,
            isPendingReview: m.isPendingReview || false,
            isCompleted: m.isCompleted || false,
            isFinalist: m.isFinalist || false,
          })),
        });
      });
    }

    // Return the updated tournament
    const updated = await prisma.tournament.findUnique({
      where: { id },
      include: { participants: true, matches: true },
    });

    res.json(formatTournament(updated));
  } catch (error) {
    console.error("Update tournament error:", error);
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

// DELETE /api/tournaments/:id
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: "Tournoi non trouvé" });
      return;
    }

    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Accès non autorisé - seul un administrateur peut supprimer un tournoi" });
      return;
    }

    await prisma.tournament.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete tournament error:", error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

export default router;
