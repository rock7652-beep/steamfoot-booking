-- PR-B follow-up: additive one-time Auth.js bridge consumption marker.
ALTER TABLE "LineOAuthAttempt"
  ADD COLUMN "sessionConsumedAt" TIMESTAMP(3);
