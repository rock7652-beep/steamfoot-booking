-- Presentation-only override; existing stores retain their module's terminology.
ALTER TABLE "ShopConfig" ADD COLUMN IF NOT EXISTS "coursePersonnelLabel" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ShopConfig_coursePersonnelLabel_check' AND conrelid='"ShopConfig"'::regclass) THEN
    ALTER TABLE "ShopConfig" ADD CONSTRAINT "ShopConfig_coursePersonnelLabel_check"
      CHECK ("coursePersonnelLabel" IS NULL OR "coursePersonnelLabel" IN ('老師','教練'));
  END IF;
END $$;
