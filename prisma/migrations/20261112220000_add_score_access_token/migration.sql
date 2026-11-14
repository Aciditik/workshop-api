-- Per-tournament secret carried by the printed QR code URL (?key=...): the
-- public scorecard submission endpoint requires it, so only people who
-- scanned the venue QR can enter scores. Existing tournaments get a random
-- token too — note their previously printed QRs (no ?key) stop working for
-- score entry and must be reprinted.
ALTER TABLE "Tournament" ADD COLUMN "scoreAccessToken" TEXT;
UPDATE "Tournament" SET "scoreAccessToken" = md5(random()::text || clock_timestamp()::text) WHERE "scoreAccessToken" IS NULL;
