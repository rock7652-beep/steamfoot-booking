/**
 * READ-ONLY: classify HealthFlow records that are still missing from Steamfoot.
 *
 * This script never creates or updates database rows. It prints aggregate counts
 * only. An optional masked review file may be created when the command is run in
 * a trusted local environment; the GitHub workflow intentionally does not create
 * or upload that file because this repository is public.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  planHealthflowSafeMatches,
  type SafeMatchCustomer,
  type SafeMatchExisting,
  type SafeMatchProfile,
  type SafeMatchRecord,
} from "../src/lib/healthflow-safe-reconciliation";

const prisma = new PrismaClient();
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const expectedRemainingValue = arg("expected-remaining");
const expectedRemaining = expectedRemainingValue === null ? null : Number(expectedRemainingValue);
const githubOutput = arg("github-output");
const reviewOutput = arg("review-output");

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  birth_date: string | null;
  store_id: string | null;
};
type StoreRow = { id: string; name: string };
type BodyRecordRow = { id: string; user_id: string };

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  if (!baseUrl || !serviceKey) throw new Error("缺少 HealthFlow 正式連線設定");
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(pageSize));
    const response = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) throw new Error(`${table} 讀取失敗 (${response.status})`);
    const page = await response.json() as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function maskName(value: string | null) {
  const name = value?.trim() ?? "";
  if (!name) return "未提供";
  if (name.length === 1) return `${name}＊`;
  return `${name[0]}${"＊".repeat(Math.max(1, name.length - 2))}${name.at(-1)}`;
}

function maskPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length < 7) return value ? "格式無效" : "未提供";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

function maskEmail(value: string | null) {
  const [local, domain] = value?.trim().split("@") ?? [];
  if (!local || !domain) return value ? "格式無效" : "未提供";
  return `${local[0]}***@${domain}`;
}

function maskBirth(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(0, 4)}-**-**` : "未提供";
}

function validateArguments() {
  if (
    expectedRemaining !== null &&
    (!Number.isSafeInteger(expectedRemaining) || expectedRemaining < 0)
  ) {
    throw new Error("expected-remaining 必須是非負整數");
  }
  if (process.argv.includes("--execute")) {
    throw new Error("本工具固定為只讀，沒有 execute 模式");
  }
}

async function main() {
  validateArguments();
  const [profileRows, storeRows, recordRows, customers, existing] = await Promise.all([
    fetchAll<ProfileRow>(
      "profiles",
      "id,full_name,phone,phone_normalized,email,birth_date,store_id",
    ),
    fetchAll<StoreRow>("stores", "id,name"),
    fetchAll<BodyRecordRow>("body_records", "id,user_id"),
    prisma.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: {
        id: true,
        storeId: true,
        name: true,
        phone: true,
        email: true,
        birthday: true,
        healthProfileId: true,
        store: { select: { slug: true } },
      },
    }),
    prisma.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW" },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    }),
  ]);

  if (new Set(recordRows.map((record) => record.id)).size !== recordRows.length) {
    throw new Error("來源量測 ID 不唯一，已停止");
  }
  const profileIds = new Set(profileRows.map((profile) => profile.id));
  if (recordRows.some((record) => !profileIds.has(record.user_id))) {
    throw new Error("來源量測引用不存在的 profile，已停止");
  }
  const sourceRecordIds = new Set(recordRows.map((record) => record.id));
  if (existing.some((row) => !row.sourceRecordId || !sourceRecordIds.has(row.sourceRecordId))) {
    throw new Error("蒸管家既有 HEALTHFLOW 紀錄無法回溯來源，已停止");
  }

  const storeNames = new Map(storeRows.map((store) => [store.id, store.name]));
  const steamfootSlugByHealthflowStore: Record<string, string> = {
    以斯帖蒸足: "hsinchu",
    暖暖蒸足: "zhubei",
    暖沐蒸足: "taichung",
  };
  const profiles: SafeMatchProfile[] = profileRows.map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    phone: profile.phone,
    phoneNormalized: profile.phone_normalized,
    email: profile.email,
    birthDate: profile.birth_date,
    storeKey: profile.store_id
      ? steamfootSlugByHealthflowStore[storeNames.get(profile.store_id) ?? ""] ?? null
      : null,
  }));
  const steamfootCustomers: SafeMatchCustomer[] = customers.map((customer) => ({
    id: customer.id,
    storeId: customer.storeId,
    storeKey: customer.store.slug,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    birthday: customer.birthday,
    healthProfileId: customer.healthProfileId,
  }));
  const records: SafeMatchRecord[] = recordRows.map((record) => ({
    id: record.id,
    userId: record.user_id,
  }));

  const plan = planHealthflowSafeMatches({
    profiles,
    customers: steamfootCustomers,
    records,
    existing: existing satisfies SafeMatchExisting[],
  });
  if (plan.summary.sourceRecordsMissingProfile !== 0) {
    throw new Error("來源量測引用不存在的 profile，已停止");
  }
  if (plan.summary.accountedForRemainingRecords !== plan.summary.remainingRecords) {
    throw new Error("安全分類未完整涵蓋剩餘紀錄，已停止");
  }
  if (expectedRemaining !== null && plan.summary.remainingRecords !== expectedRemaining) {
    throw new Error(
      `剩餘筆數已變動：預期 ${expectedRemaining}，實際 ${plan.summary.remainingRecords}；已停止`,
    );
  }

  if (githubOutput) {
    const counts = plan.summary.reviewCounts;
    appendFileSync(
      githubOutput,
      [
        `source_records=${plan.summary.sourceRecords}`,
        `already_imported_records=${plan.summary.alreadyImportedRecords}`,
        `remaining_records=${plan.summary.remainingRecords}`,
        `safe_profiles=${plan.summary.safeProfiles}`,
        `safe_records=${plan.summary.safeRecords}`,
        `manual_profiles=${plan.summary.manualProfiles}`,
        `manual_records=${plan.summary.manualRecords}`,
        `no_customer_records=${counts.no_customer.records}`,
        `ambiguous_records=${counts.target_ambiguous.records + counts.source_identity_reused.records}`,
        `conflict_records=${counts.identity_conflict.records + counts.existing_conflict.records + counts.different_health_profile.records}`,
        `insufficient_records=${counts.insufficient_evidence.records + counts.missing_identity.records}`,
        `plan_digest=${plan.digest}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  if (reviewOutput) {
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
    const review = plan.reviews.map((item, index) => {
      const source = profileById.get(item.profileId);
      return {
        sequence: index + 1,
        store: source?.store_id
          ? storeNames.get(source.store_id) ?? "未知門市"
          : "舊資料未標門市",
        name: maskName(source?.full_name ?? null),
        phone: maskPhone(source?.phone_normalized ?? source?.phone ?? null),
        birth: maskBirth(source?.birth_date ?? null),
        email: maskEmail(source?.email ?? null),
        recordCount: item.pendingSourceRecordIds.length,
        reason: item.reason,
        candidateCount: item.candidateCount,
      };
    });
    writeFileSync(reviewOutput, JSON.stringify(review, null, 2), "utf8");
  }

  console.log(JSON.stringify({
    mode: "read-only",
    ...plan.summary,
    planDigest: plan.digest,
    privacy: "stdout contains aggregate counts only; no PII or database identifiers",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
