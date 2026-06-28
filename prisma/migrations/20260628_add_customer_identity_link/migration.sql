-- CreateTable
CREATE TABLE "CustomerIdentityLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentityLink_customerId_key" ON "CustomerIdentityLink"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_identity_provider_store" ON "CustomerIdentityLink"("provider", "providerAccountId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_identity_user_store" ON "CustomerIdentityLink"("userId", "storeId");

-- CreateIndex
CREATE INDEX "CustomerIdentityLink_storeId_idx" ON "CustomerIdentityLink"("storeId");

-- CreateIndex
CREATE INDEX "CustomerIdentityLink_userId_idx" ON "CustomerIdentityLink"("userId");

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
