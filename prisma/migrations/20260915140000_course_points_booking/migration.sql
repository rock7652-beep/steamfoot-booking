-- CreateTable
CREATE TABLE "CoursePointPlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "validDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CoursePointPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePointCard" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePointCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCardMember" (
    "cardId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "CourseCardMember_pkey" PRIMARY KEY ("cardId","customerId")
);

-- CreateTable
CREATE TABLE "CourseBooking" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "operatorCustomerId" TEXT,
    "operatorName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePointEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "bookingId" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseBookingRule" (
    "storeId" TEXT NOT NULL,
    "bookingLeadMinutes" INTEGER NOT NULL DEFAULT 0,
    "cancellationLeadMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseBookingRule_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointPlan_id_storeId_key" ON "CoursePointPlan"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointPlan_storeId_name_key" ON "CoursePointPlan"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointCard_id_storeId_key" ON "CoursePointCard"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointCard_storeId_requestKey_key" ON "CoursePointCard"("storeId", "requestKey");

-- CreateIndex
CREATE INDEX "CourseCardMember_storeId_customerId_idx" ON "CourseCardMember"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "CourseBooking_storeId_sessionId_status_idx" ON "CourseBooking"("storeId", "sessionId", "status");

-- CreateIndex
CREATE INDEX "CourseBooking_storeId_cardId_status_idx" ON "CourseBooking"("storeId", "cardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseBooking_id_storeId_key" ON "CourseBooking"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseBooking_storeId_requestKey_key" ON "CourseBooking"("storeId", "requestKey");

-- CreateIndex
CREATE INDEX "CoursePointEntry_storeId_cardId_createdAt_idx" ON "CoursePointEntry"("storeId", "cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePointEntry_bookingId_kind_key" ON "CoursePointEntry"("bookingId", "kind");

-- AddForeignKey
ALTER TABLE "CoursePointCard" ADD CONSTRAINT "CoursePointCard_planId_storeId_fkey" FOREIGN KEY ("planId", "storeId") REFERENCES "CoursePointPlan"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCardMember" ADD CONSTRAINT "CourseCardMember_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_sessionId_storeId_fkey" FOREIGN KEY ("sessionId", "storeId") REFERENCES "CourseSession"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_cardId_storeId_fkey" FOREIGN KEY ("cardId", "storeId") REFERENCES "CoursePointCard"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "CourseBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defence in depth for writes outside the application transaction.
CREATE UNIQUE INDEX "CourseBooking_active_learner" ON "CourseBooking" ("storeId", "sessionId", "customerId") WHERE status <> 'CANCELLED';
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT "CoursePointPlan_values" CHECK (points > 0 AND price >= 0 AND "validDays" > 0);
ALTER TABLE "CoursePointCard" ADD CONSTRAINT "CoursePointCard_balance" CHECK (remaining >= 0);
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost" > 0 AND status IN ('RESERVED', 'CANCELLED', 'ATTENDED'));
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND kind IN ('GRANT', 'RESERVE', 'RELEASE', 'DEBIT'));
ALTER TABLE "CourseBookingRule" ADD CONSTRAINT "CourseBookingRule_values" CHECK ("bookingLeadMinutes" >= 0 AND "cancellationLeadMinutes" >= 0);
ALTER TABLE "CourseCardMember" ADD CONSTRAINT "CourseCardMember_customer_fk" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_customer_fk" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_operator_customer_fk" FOREIGN KEY ("operatorCustomerId", "storeId") REFERENCES "Customer"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_operator_fk" FOREIGN KEY ("operatorUserId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_actor_fk" FOREIGN KEY ("actorUserId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT "CoursePointPlan_store_fk" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseBookingRule" ADD CONSTRAINT "CourseBookingRule_store_fk" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CoursePointPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoursePointCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseCardMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoursePointEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseBookingRule" ENABLE ROW LEVEL SECURITY;
