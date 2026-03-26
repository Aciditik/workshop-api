-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "tableLabel" TEXT,
    "participantIds" TEXT NOT NULL,
    "results" TEXT NOT NULL DEFAULT '{}',
    "scorecards" TEXT,
    "isPendingReview" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isFinalist" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("id", "isCompleted", "isPendingReview", "participantIds", "results", "round", "scorecards", "tableNumber", "tournamentId") SELECT "id", "isCompleted", "isPendingReview", "participantIds", "results", "round", "scorecards", "tableNumber", "tournamentId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "eventDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "format" TEXT NOT NULL DEFAULT 'swiss',
    "size" INTEGER NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 2,
    "qualifiedIds" TEXT,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Tournament_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("createdAt", "currentRound", "eventDate", "id", "logoUrl", "name", "ownerId", "size", "status") SELECT "createdAt", "currentRound", "eventDate", "id", "logoUrl", "name", "ownerId", "size", "status" FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
