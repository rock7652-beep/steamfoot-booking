-- Daily store-scoped human numbers. Original identifiers and financial links stay intact.
ALTER TABLE public."InventoryOrder" ADD COLUMN IF NOT EXISTS "workOrderNumber" TEXT;
ALTER TABLE public."InventoryOrder" ADD COLUMN IF NOT EXISTS "workOrderSequence" INTEGER;
WITH numbered AS (
  SELECT id, "date", row_number() OVER (PARTITION BY "storeId", "date" ORDER BY "createdAt", id)::integer AS sequence
  FROM public."InventoryOrder" WHERE "workOrder" IS NOT NULL AND "workOrder" <> 'null'::jsonb
)
UPDATE public."InventoryOrder" o
SET "workOrderSequence" = n.sequence,
    "workOrderNumber" = to_char(n."date", 'YYMMDD') || lpad(n.sequence::text, greatest(3,length(n.sequence::text)), '0')
FROM numbered n WHERE o.id = n.id AND o."workOrderNumber" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryOrder_storeId_workOrderNumber_key"
  ON public."InventoryOrder" ("storeId", "workOrderNumber");
