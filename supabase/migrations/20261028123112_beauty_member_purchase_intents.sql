-- Staged, disabled until every member and manager purchase entry is migrated.
CREATE TABLE public."BeautyMemberPurchaseIntent" (
  "storeId" text NOT NULL REFERENCES public."Store"(id),
  "customerId" text NOT NULL,
  "actorUserId" text NOT NULL REFERENCES public."User"(id),
  "requestKey" text NOT NULL,
  status text NOT NULL CHECK (status IN ('PREPARED','COMMITTED','ACKNOWLEDGED','CANCELLED')),
  fingerprint text CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$'),
  "purchaseId" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("storeId", "requestKey"),
  FOREIGN KEY ("storeId", "customerId") REFERENCES public."Customer"("storeId", id),
  FOREIGN KEY ("storeId", "purchaseId") REFERENCES public."BeautyPurchase"("storeId", id),
  CHECK ((status IN ('COMMITTED','ACKNOWLEDGED')) = ("purchaseId" IS NOT NULL)),
  CHECK (status = 'CANCELLED' OR fingerprint IS NOT NULL)
);
CREATE UNIQUE INDEX "BeautyMemberPurchaseIntent_one_unresolved"
  ON public."BeautyMemberPurchaseIntent" ("storeId", "customerId")
  WHERE status IN ('PREPARED','COMMITTED');
ALTER TABLE public."BeautyMemberPurchaseIntent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyMemberPurchaseIntent" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."BeautyMemberPurchaseIntent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public."BeautyMemberPurchaseIntent" FROM authenticated;
  END IF;
END $$;
