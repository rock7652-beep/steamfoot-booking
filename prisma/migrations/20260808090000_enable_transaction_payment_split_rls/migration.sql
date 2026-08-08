-- TransactionPaymentSplit is application-owned data in the exposed public schema.
--
-- The application reads and writes payment splits exclusively through server-side
-- Prisma. Store and headquarters authorization is enforced on the parent
-- Transaction query before Prisma reaches these rows. Consistent with the other
-- application tables, no anon/authenticated grants or permissive policies are
-- added here: direct Data API access remains denied while the server-side Prisma
-- role retains the existing operational, reporting, and export paths.
ALTER TABLE "TransactionPaymentSplit" ENABLE ROW LEVEL SECURITY;
