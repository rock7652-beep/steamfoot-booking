-- Additive, staged capability. The application must not enable the intent
-- guard until the checkout UI and every legacy route have been verified.
CREATE TABLE public."BeautyPurchaseIntent" (
  "storeId" text NOT NULL REFERENCES public."Store"(id),
  "customerId" text NOT NULL,
  "requestKey" text NOT NULL,
  status text NOT NULL CHECK (status IN ('PREPARED','COMMITTED','ACKNOWLEDGED','CANCELLED')),
  fingerprint text CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$'),
  "cardId" text,
  "actorUserId" text NOT NULL REFERENCES public."User"(id),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("storeId","requestKey"),
  FOREIGN KEY ("storeId","customerId") REFERENCES public."Customer"("storeId",id),
  FOREIGN KEY ("storeId","cardId") REFERENCES public."BeautyCard"("storeId",id),
  CHECK ((status IN ('COMMITTED','ACKNOWLEDGED')) = ("cardId" IS NOT NULL)),
  CHECK (status = 'CANCELLED' OR fingerprint IS NOT NULL)
);
-- A committed result remains unresolved until the operator acknowledges it;
-- another device cannot silently start a second purchase in that interval.
CREATE UNIQUE INDEX "BeautyPurchaseIntent_one_unresolved_per_customer"
  ON public."BeautyPurchaseIntent" ("storeId","customerId")
  WHERE status IN ('PREPARED','COMMITTED');
ALTER TABLE public."BeautyPurchaseIntent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyPurchaseIntent" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."BeautyPurchaseIntent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public."BeautyPurchaseIntent" FROM authenticated;
  END IF;
END $$;
