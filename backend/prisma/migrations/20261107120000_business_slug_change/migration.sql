-- Additive: existing businesses keep their slug and start with the change unused.
ALTER TABLE "Business" ADD COLUMN "slugChangedAt" TIMESTAMP(3);
