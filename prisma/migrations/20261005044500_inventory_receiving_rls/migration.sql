-- Inventory is accessed through authorized Prisma server operations, never the public Data API.
ALTER TABLE "InventoryReceiving" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryReceiving" FROM anon, authenticated;
