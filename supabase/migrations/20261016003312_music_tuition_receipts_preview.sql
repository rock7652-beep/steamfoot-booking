-- Preview-only rollout; apply to ttworfzgwejdeolegkxl explicitly, never production.
CREATE TABLE public."CourseMusicTuition" (
 "purchaseId" text PRIMARY KEY,
 "storeId" text NOT NULL,
 "due" integer NOT NULL CHECK (due BETWEEN 0 AND 10000000),
 "discountTeacherFee" boolean NOT NULL DEFAULT false,
 "checkoutFingerprint" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY ("purchaseId","storeId") REFERENCES public."CoursePurchase"(id,"storeId")
);
CREATE INDEX ON public."CourseMusicTuition"("storeId");
CREATE TABLE public."CourseMusicReceipt" (
 id text PRIMARY KEY,
 "storeId" text NOT NULL,
 "purchaseId" text NOT NULL,
 amount integer NOT NULL CHECK (amount > 0 AND amount <= 10000000),
 "paidAt" timestamptz NOT NULL,
 method text NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CARD','OTHER')),
 "lastFour" text,
 "requestKey" text NOT NULL,
 "actorUserId" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("storeId","requestKey"),
 FOREIGN KEY ("purchaseId","storeId") REFERENCES public."CoursePurchase"(id,"storeId"),
 FOREIGN KEY ("purchaseId") REFERENCES public."CourseMusicTuition"("purchaseId"),
 CHECK ((method='BANK_TRANSFER' AND "lastFour" ~ '^[0-9]{4}$') OR (method<>'BANK_TRANSFER' AND "lastFour" IS NULL))
);
CREATE INDEX ON public."CourseMusicReceipt"("storeId","paidAt");
CREATE INDEX ON public."CourseMusicReceipt"("purchaseId");
ALTER TABLE public."CourseMusicTuition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CourseMusicReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CourseMusicTuition",public."CourseMusicReceipt" FROM anon,authenticated;
