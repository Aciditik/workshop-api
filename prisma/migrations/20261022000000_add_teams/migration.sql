-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "teams" TEXT;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "teamId" TEXT;
