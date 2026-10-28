-- Staged only: the application flag must stay off until every collection entry
-- point and existing pending request has been migrated and verified.
CREATE TABLE public."BeautyCollectionIntent" (
  "storeId" text NOT NULL REFERENCES public."Store"(id),
  "requestKey" text NOT NULL,
  status text NOT NULL CHECK (status IN ('PREPARED','COMMITTED','ACKNOWLEDGED','CANCELLED')),
  fingerprint text CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$'),
  "actorUserId" text NOT NULL REFERENCES public."User"(id),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("storeId","requestKey"),
  CHECK (status = 'CANCELLED' OR fingerprint IS NOT NULL)
);

-- Retain every original appointment, including cancelled tombstones. `active`
-- remains true after commit until an authorized explicit acknowledgement.
CREATE TABLE public."BeautyCollectionIntentItem" (
  "storeId" text NOT NULL,
  "requestKey" text NOT NULL,
  "appointmentId" text NOT NULL,
  active boolean NOT NULL,
  PRIMARY KEY ("storeId","requestKey","appointmentId"),
  FOREIGN KEY ("storeId","requestKey") REFERENCES public."BeautyCollectionIntent"("storeId","requestKey"),
  FOREIGN KEY ("storeId","appointmentId") REFERENCES public."BeautyAppointment"("storeId",id)
);
CREATE UNIQUE INDEX "BeautyCollectionIntentItem_one_unresolved"
  ON public."BeautyCollectionIntentItem"("storeId","appointmentId") WHERE active;
ALTER TABLE public."BeautyCollectionIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BeautyCollectionIntentItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyCollectionIntent", public."BeautyCollectionIntentItem" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."BeautyCollectionIntent", public."BeautyCollectionIntentItem" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public."BeautyCollectionIntent", public."BeautyCollectionIntentItem" FROM authenticated;
  END IF;
END $$;
