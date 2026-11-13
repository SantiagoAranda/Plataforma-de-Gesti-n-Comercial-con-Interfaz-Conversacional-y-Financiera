-- No historical state/date inference. New enum was committed by the prior migration.
ALTER TABLE "Reservation"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "walkIn" BOOLEAN NOT NULL DEFAULT false;
