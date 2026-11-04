-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "day1ResultsPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN "day2ResultsPublished" BOOLEAN NOT NULL DEFAULT false;
