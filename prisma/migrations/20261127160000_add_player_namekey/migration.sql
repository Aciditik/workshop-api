-- Additive only: normalized lookup key on Player. Backfilled by
-- scripts/normalize-merge-players.js (which also merges spelling-variant
-- duplicates like "Côme"/"Come" created by the first backfill).
ALTER TABLE "Player" ADD COLUMN "nameKey" TEXT;
CREATE INDEX "Player_nameKey_idx" ON "Player"("nameKey");
