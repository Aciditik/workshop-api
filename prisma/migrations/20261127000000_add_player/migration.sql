-- Additive only: new Player table + nullable FK on Participant. Nothing
-- existing is altered or dropped; safe to deploy and backfill at leisure.
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "firstname" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pseudo" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Participant" ADD COLUMN "playerId" TEXT;

ALTER TABLE "Participant" ADD CONSTRAINT "Participant_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Participant_playerId_idx" ON "Participant"("playerId");
