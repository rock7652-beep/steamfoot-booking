/**
 * Central membership readiness audit — READ ONLY.
 *
 * Prints aggregate counts only. It never outputs names, phone numbers,
 * e-mails, Customer/User ids, provider account ids, or OAuth tokens.
 */
import { PrismaClient } from "@prisma/client";
import { summarizeCentralMemberReadiness } from "../src/server/services/central-member-readiness";

const prisma = new PrismaClient();

async function main() {
  const [customers, links] = await Promise.all([
    prisma.customer.findMany({
      select: {
        id: true,
        storeId: true,
        phone: true,
        userId: true,
        mergedIntoCustomerId: true,
      },
    }),
    prisma.customerIdentityLink.findMany({
      select: {
        customerId: true,
        storeId: true,
        userId: true,
        provider: true,
      },
    }),
  ]);

  const summary = summarizeCentralMemberReadiness(customers, links);
  console.log("===== Central Membership Readiness (READ-ONLY, aggregate only) =====");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Phone matches are review candidates only and are never auto-linked.");
}

main()
  .catch((error) => {
    console.error("Central membership readiness audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
