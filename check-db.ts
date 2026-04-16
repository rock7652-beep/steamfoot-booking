import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const user = await p.user.findFirst({
    where: { email: "rock7652@gmail.com" },
    include: { staff: true, customer: true, accounts: true }
  });
  console.log("User:", JSON.stringify(user, null, 2));
  
  // Also check if there are any other users with ADMIN potential
  const allUsers = await p.user.findMany({
    where: { role: { in: ["ADMIN", "OWNER"] } },
    select: { id: true, name: true, email: true, role: true, status: true }
  });
  console.log("\nAll ADMIN/OWNER users:", JSON.stringify(allUsers, null, 2));
  await p.$disconnect();
}
main();
