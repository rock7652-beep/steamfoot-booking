/** Final 25 active-plan LIFF readiness audit — STRICTLY READ ONLY. */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const reportPath = process.env.FINAL_25_LIFF_AUDIT_REPORT_PATH ?? "final-25-no-otp-liff-audit.json";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const rebindReason = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
const captureReason = "LIFF_LOGIN_FIRST_CAPTURE_V1";

const targetCustomerIds = [
  "cmrllha0l0002jp04wfd11hmq", "cms39pn9n0002jr045bth6v4o",
  "cms7hu8vh0007kz04c97qn1s0", "cmrkkmpj50001jz047h6ml7ip",
  "cmsnydfoa0001l404ef9962ti", "cmscq288z0001l1045t3phc4o",
  "cmrpxw8pp0001l104cvho2bav", "cmsdzjyz40001l204t90i8925",
  "cmoigppvt0001jr04h3i2p66r", "cmojv9rkb0003jo04x6hfstuc",
  "cms933hkr0001k104ufe2q1pd", "cmojy74oe0001jo04um0qb7at",
  "cmsdg4w630002kz04q0166mvt", "cmpujx2jj0002ji0426eoc4gc",
  "cmrynwmum0001l604m852g5m6", "cmsfu4tei0001lf046glyq0fo",
  "cmruhq05e0002jf04j88frlpx", "cmr5ta9zq0001js0447r8tsdb",
  "cmqzhrsff0001l404tsaqlnd8", "cmsujg46c0001jr049498w40a",
  "cmqwagvm10001l904qqvxry7y", "cmsh1zfro0007jx04fxn3fxgy",
  "cmshdvrcj0001l004kjylpms2", "cmr42waoj0005jm04zc2uqil3",
  "cmsq5vtqo0001if04on2s30bq",
] as const;

type Action = "FIRST_CAPTURE" | "CLEAN_EXTRA_AND_REBIND" | "ALIGN_LINK_AND_REBIND" | "READY_REBIND" | "STANDARD_ONBOARDING";

async function main() {
  const now = new Date();
  const [customers, allCustomers, links, accounts, users, stores, requests] = await Promise.all([
    prisma.customer.findMany({
      where: {
        id: { in: [...targetCustomerIds] }, mergedIntoCustomerId: null,
        planWallets: { some: { status: "ACTIVE", remainingSessions: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } },
      },
      select: { id: true, storeId: true, name: true, phone: true, userId: true },
    }),
    prisma.customer.findMany({ where: { mergedIntoCustomerId: null }, select: { id: true, storeId: true, phone: true, userId: true } }),
    prisma.customerIdentityLink.findMany({ where: { provider: "line" }, select: { id: true, storeId: true, customerId: true, userId: true, providerAccountId: true, lineUserId: true } }),
    prisma.account.findMany({ where: { provider: "line" }, select: { id: true, userId: true, providerAccountId: true } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, status: true, role: true, phone: true } }),
    prisma.store.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.lineRebindRequest.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, customerId: true, reason: true, status: true, expiresAt: true, candidate: { select: { id: true } } } }),
  ]);
  const storeById = new Map(stores.map((store) => [store.id, store] as const));
  const userById = new Map(users.map((user) => [user.id, user] as const));
  const plans: Array<Record<string, unknown>> = [];
  const manual: Array<Record<string, unknown>> = [];
  const fail = (customer: typeof customers[number], code: string) => manual.push({ store: storeById.get(customer.storeId)?.name ?? "unknown", customerId: customer.id, customerName: customer.name, code });
  const requestMode = (customerId: string, desiredReason: string) => {
    const rows = requests.filter((request) => request.customerId === customerId);
    const active = rows.filter((request) => ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"].includes(request.status) && request.expiresAt > now);
    if (active.length > 1 || (active[0] && active[0].reason !== desiredReason) || rows.some((request) => request.candidate)) return null;
    return { requestId: rows[0]?.id ?? null, requestMode: active[0] ? "ACTIVE" : rows[0] ? "REUSABLE" : "CREATE" };
  };
  const add = (customer: typeof customers[number], action: Action, userId: string | null, linkId: string | null, accountId: string | null, providerAccountId: string | null, extraAccountIds: string[] = []) => {
    const desiredReason = action === "FIRST_CAPTURE" ? captureReason : action === "STANDARD_ONBOARDING" ? null : rebindReason;
    const request = desiredReason ? requestMode(customer.id, desiredReason) : { requestId: null, requestMode: "NONE" };
    if (!request) return fail(customer, "REBIND_REQUEST_CONFLICT");
    plans.push({
      storeId: customer.storeId, store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
      customerId: customer.id, customerName: customer.name, phoneHash: sha256(normalizePhone(customer.phone)), action, userId, linkId, accountId,
      providerAccountIdHash: providerAccountId ? sha256(providerAccountId) : null,
      extraAccountIds: [...extraAccountIds].sort(), requestId: request.requestId, requestMode: request.requestMode,
    });
  };

  if (customers.length !== targetCustomerIds.length) throw new Error(`target_set_changed:${customers.length}`);
  for (const customer of customers) {
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone) || allCustomers.filter((item) => item.storeId === customer.storeId && normalizePhone(item.phone) === phone).length !== 1) {
      fail(customer, "PHONE_NOT_UNIQUE_IN_STORE"); continue;
    }
    const customerLinks = links.filter((link) => link.customerId === customer.id);
    if (customer.userId) {
      const user = userById.get(customer.userId);
      if (!user || user.status !== "ACTIVE") { fail(customer, "DIRECT_USER_NOT_ACTIVE"); continue; }
      const userAccounts = accounts.filter((account) => account.userId === user.id);
      const ownedLinks = customerLinks.filter((link) => link.userId === user.id);
      if (ownedLinks.length === 0 && customerLinks.length === 0 && userAccounts.length === 0) {
        add(customer, "FIRST_CAPTURE", user.id, null, null, null); continue;
      }
      if (ownedLinks.length === 1 && customerLinks.length === 1 && ownedLinks[0].lineUserId === ownedLinks[0].providerAccountId) {
        const matching = userAccounts.filter((account) => account.providerAccountId === ownedLinks[0].providerAccountId);
        const extras = userAccounts.filter((account) => account.providerAccountId !== ownedLinks[0].providerAccountId);
        const extrasReferenced = extras.some((account) => links.some((link) => link.providerAccountId === account.providerAccountId));
        if (matching.length === 1 && extras.length > 0 && !extrasReferenced) {
          add(customer, "CLEAN_EXTRA_AND_REBIND", user.id, ownedLinks[0].id, matching[0].id, ownedLinks[0].providerAccountId, extras.map((account) => account.id)); continue;
        }
      }
      fail(customer, "DIRECT_USER_STRUCTURE_NOT_DETERMINISTIC"); continue;
    }

    if (customerLinks.length === 0) {
      const activePhoneUsers = users.filter((user) => user.status === "ACTIVE" && user.phone && normalizePhone(user.phone) === phone);
      if (activePhoneUsers.length === 0) { add(customer, "STANDARD_ONBOARDING", null, null, null, null); continue; }
      fail(customer, "UNLINKED_PHONE_USER_CONFLICT"); continue;
    }
    if (customerLinks.length !== 1) { fail(customer, "CUSTOMER_LINK_CARDINALITY"); continue; }
    const link = customerLinks[0];
    const owner = userById.get(link.userId);
    if (!owner || owner.status !== "ACTIVE") { fail(customer, "LINK_OWNER_NOT_ACTIVE"); continue; }
    const ownerAccounts = accounts.filter((account) => account.userId === owner.id);
    const matching = ownerAccounts.filter((account) => account.providerAccountId === link.providerAccountId);
    const extras = ownerAccounts.filter((account) => account.providerAccountId !== link.providerAccountId);
    const extrasReferenced = extras.some((account) => links.some((other) => other.providerAccountId === account.providerAccountId));
    if (matching.length === 1 && link.lineUserId === link.providerAccountId && extras.length === 0) {
      add(customer, "READY_REBIND", owner.id, link.id, matching[0].id, link.providerAccountId); continue;
    }
    if (matching.length === 1 && link.lineUserId === link.providerAccountId && extras.length > 0 && !extrasReferenced) {
      add(customer, "CLEAN_EXTRA_AND_REBIND", owner.id, link.id, matching[0].id, link.providerAccountId, extras.map((account) => account.id)); continue;
    }
    if (ownerAccounts.length === 1 && matching.length === 0) {
      const account = ownerAccounts[0];
      const sameStoreConflict = links.some((other) => other.storeId === customer.storeId && other.id !== link.id && other.providerAccountId === account.providerAccountId);
      const crossUserConflict = links.some((other) => other.providerAccountId === account.providerAccountId && other.userId !== owner.id);
      if (!sameStoreConflict && !crossUserConflict) {
        add(customer, "ALIGN_LINK_AND_REBIND", owner.id, link.id, account.id, account.providerAccountId); continue;
      }
    }
    fail(customer, "CROSS_STORE_STRUCTURE_NOT_DETERMINISTIC");
  }
  plans.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW"));
  manual.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW"));
  const fingerprintRows = plans.map(({ store, customerName, ...row }) => row);
  const actionCounts = Object.fromEntries([...new Set(plans.map((row) => String(row.action)))].sort().map((action) => [action, plans.filter((row) => row.action === action).length]));
  const summary = { targeted: targetCustomerIds.length, deterministic: plans.length, manual: manual.length, actionCounts, fingerprint: sha256(JSON.stringify(fingerprintRows)) };
  await writeFile(reportPath, JSON.stringify({ generatedAt: now.toISOString(), summary, plans, manual }, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "audit_failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
