/**
 * One-time production member login readiness audit — STRICTLY READ ONLY.
 *
 * Security:
 * - Prisma calls in this file are findMany only.
 * - PII is written only to the private workflow artifact, never stdout.
 * - stdout contains aggregate counts only because this repository is public.
 */
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { detectCentralMemberHealthIssues } from "../src/server/services/central-member-health";

const prisma = new PrismaClient();
const reportPath = process.env.LOGIN_AUDIT_REPORT_PATH ?? "member-login-audit.json";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "格式異常";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

const reasonLabels: Record<string, string> = {
  duplicate_phone: "同一門市有重複手機號碼，需確認是否為重複會員",
  line_identity_mismatch: "LINE 身分與會員登入帳號不一致",
  google_identity_mismatch: "Google 身分與會員登入帳號不一致",
  link_store_mismatch: "中央登入連結指向錯誤門市",
  merged_customer: "中央登入連結仍指向已合併會員",
  customer_linked_to_another_user: "中央登入連結與會員 userId 不一致",
  multiple_customers_in_store: "同一登入帳號在同店連結多筆會員",
};

async function main() {
  const [stores, customers, links, users, pendingReviews, pendingRebinds] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.customer.findMany({
      select: {
        id: true, storeId: true, name: true, phone: true, userId: true,
        googleId: true, lineUserId: true, mergedIntoCustomerId: true,
      },
    }),
    prisma.customerIdentityLink.findMany({
      select: {
        id: true, storeId: true, customerId: true, userId: true,
        provider: true, providerAccountId: true, lineUserId: true,
      },
    }),
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: {
        id: true, phone: true, status: true, passwordHash: true,
        accounts: { select: { provider: true } },
      },
    }),
    prisma.centralMemberLinkReviewRequest.findMany({
      where: { status: "PENDING" }, select: { customerId: true },
    }),
    prisma.lineRebindRequest.findMany({
      where: { status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] } },
      select: { customerId: true, status: true, expiresAt: true },
    }),
  ]);

  const activeCustomers = customers.filter((row) => row.mergedIntoCustomerId === null);
  const activeById = new Map(activeCustomers.map((row) => [row.id, row] as const));
  const storeById = new Map(stores.map((row) => [row.id, row] as const));
  const userById = new Map(users.map((row) => [row.id, row] as const));
  const usersByPhone = new Map<string, typeof users>();
  for (const user of users) {
    const phone = user.phone?.replace(/\D/g, "") ?? "";
    if (!phone) continue;
    const normalized = phone.startsWith("886") && phone.length === 12 ? `0${phone.slice(3)}` : phone;
    const rows = usersByPhone.get(normalized) ?? [];
    rows.push(user);
    usersByPhone.set(normalized, rows);
  }
  const issuesByCustomer = new Map<string, Set<string>>();
  const addIssue = (customerId: string, reason: string) => {
    if (!activeById.has(customerId)) return;
    const reasons = issuesByCustomer.get(customerId) ?? new Set<string>();
    reasons.add(reason);
    issuesByCustomer.set(customerId, reasons);
  };

  for (const store of stores) {
    for (const issue of detectCentralMemberHealthIssues(store.id, customers, links)) {
      for (const customerId of issue.customerIds) addIssue(customerId, reasonLabels[issue.reason]);
    }
  }

  for (const customer of activeCustomers) {
    const customerPhoneDigits = customer.phone.replace(/\D/g, "");
    const normalizedCustomerPhone = customerPhoneDigits.startsWith("886") && customerPhoneDigits.length === 12
      ? `0${customerPhoneDigits.slice(3)}`
      : customerPhoneDigits;
    if (customer.userId) {
      const user = userById.get(customer.userId);
      if (!user) addIssue(customer.id, "會員連結的登入帳號不存在或不是顧客帳號");
      else {
        if (user.status !== "ACTIVE") addIssue(customer.id, "登入帳號已停用");
        if (!user.passwordHash && user.accounts.length === 0) addIssue(customer.id, "登入帳號沒有密碼、LINE 或 Google 等可用登入方式");
      }
    } else {
      const samePhoneUsers = usersByPhone.get(normalizedCustomerPhone) ?? [];
      if (samePhoneUsers.length > 0) {
        addIssue(customer.id, "相同手機已有登入帳號，但尚未與這筆門市會員完成安全連結");
      }
    }

    const customerLinks = links.filter((link) => link.customerId === customer.id);
    if (customer.lineUserId && !customerLinks.some((link) => link.provider === "line")) {
      addIssue(customer.id, "會員顯示已綁定 LINE，但缺少中央 LINE 登入連結");
    }
    if (customer.googleId && !customerLinks.some((link) => link.provider === "google")) {
      addIssue(customer.id, "會員顯示已綁定 Google，但缺少中央 Google 登入連結");
    }
  }

  for (const row of pendingReviews) addIssue(row.customerId, "有尚待店家處理的會員連結確認申請");
  const now = new Date();
  for (const row of pendingRebinds) {
    if (row.expiresAt > now) addIssue(row.customerId, "有尚未完成的 LINE 重新綁定流程");
  }

  const abnormal = [...issuesByCustomer.entries()].map(([customerId, reasons]) => {
    const customer = activeById.get(customerId)!;
    const store = storeById.get(customer.storeId);
    return {
      store: store?.name ?? store?.slug ?? "未知門市",
      customerName: customer.name,
      phone: maskPhone(customer.phone),
      reasons: [...reasons].sort(),
    };
  }).sort((a, b) => a.store.localeCompare(b.store, "zh-TW") || a.customerName.localeCompare(b.customerName, "zh-TW"));

  const unregistered = activeCustomers.filter((row) => !row.userId && !issuesByCustomer.has(row.id));
  const summary = {
    auditedActiveCustomers: activeCustomers.length,
    abnormalCustomers: abnormal.length,
    noAbnormalityDetected: activeCustomers.length - abnormal.length,
    notYetRegistered: unregistered.length,
    note: "尚未註冊不等於登入異常；顧客首次從門市 LIFF 進入時仍可完成認領。",
  };
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, abnormal }, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error("Member login audit failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
