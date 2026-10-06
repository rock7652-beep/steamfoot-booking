-- One canonical order backs both work-order and sales views. No duplicate stock or finance source.
ALTER TABLE public."InventoryOrder" ADD COLUMN "workOrder" JSONB;
CREATE INDEX "InventoryOrder_work_order_store_date_idx"
 ON public."InventoryOrder" ("storeId", "date" DESC, id DESC)
 WHERE "workOrder" IS NOT NULL;
