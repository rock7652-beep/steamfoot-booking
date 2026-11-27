CREATE TYPE "BrandAiReplyOutcome" AS ENUM ('ANSWER', 'HANDOFF', 'ERROR');

CREATE TABLE "BrandAiReplyLog" (
    "webhookEventId" TEXT NOT NULL,
    "outcome" "BrandAiReplyOutcome" NOT NULL DEFAULT 'ERROR',
    "faqId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandAiReplyLog_pkey" PRIMARY KEY ("webhookEventId"),
    CONSTRAINT "BrandAiReplyLog_nonnegative" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
        ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
        ("latencyMs" IS NULL OR "latencyMs" >= 0)
    )
);

-- Server only. No browser/Data API policies are introduced.
ALTER TABLE "BrandAiReplyLog" ENABLE ROW LEVEL SECURITY;
