-- Additive: existing subscriptions start at epoch 0, matching users that never reset.
ALTER TABLE "PushSubscription" ADD COLUMN "authorizedSessionVersion" INTEGER NOT NULL DEFAULT 0;
