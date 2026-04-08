-- Backfill existing rows before adding constraints
UPDATE "Participant" SET "email" = '' WHERE "email" IS NULL;
UPDATE "Participant" SET "phone" = '' WHERE "phone" IS NULL;

-- Add firstname column with default for existing rows, then drop default
ALTER TABLE "Participant" ADD COLUMN "firstname" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Participant" ALTER COLUMN "firstname" DROP DEFAULT;

-- Make email and phone non-nullable
ALTER TABLE "Participant" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "Participant" ALTER COLUMN "phone" SET NOT NULL;
