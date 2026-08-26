/**
 * One-time recovery for the remaining 暖暖／暖沐 profiles whose old phone no
 * longer identifies a Steamfoot customer. Only unique same-store name+birth
 * or name+email matches are eligible. Dry-run is the default.
 */
import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  parseHealthflowMeasurementDate,
  planHealthflowPhoneRecovery,
  type HealthflowPhoneRecoveryCustomer,
  type HealthflowPhoneRecoveryExisting,
} from "../src/lib/healthflow-phone-recovery";
import {
  planHealthflowSecondaryRecovery,
  type SecondaryRecoveryCustomer,
  type SecondaryRecoveryProfile,
  type SecondaryRecoveryRecord,
} from "../src/lib/healthflow-secondary-recovery";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-secondary-identity-recovery");
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const expectedPendingValue = arg("expected-pending");
const expectedPending = expectedPendingValue === null ? null : Number(expectedPendingValue);
const expectedDigest = arg("expected-plan-sha256");
const githubOutput = arg("github-output");

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
type BodyRecordRow = {
  id: string;
  user_id: string;
  measured_at: string;
  weight: number | null;
  bmi: number | null;
  body_fat: number | null;
  muscle_mass: number | null;
  bone_mass: number | null;
  visceral_fat: number | null;
  bmr: number | null;
  body_water: number | null;
  metabolic_age: number | null;
  note: string | null;
};

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

async function loadSteamfootState(client: Pick<PrismaClient, "customer" | "customerHealthRecord">) {
  const [rows, existing] = await Promise.all([
    client.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: {
        id: true, storeId: true, name: true, phone: true, email: true,
        birthday: true, healthProfileId: true, store: { select: { slug: true } },
      },
    }),
    client.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW" },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    }),
  ]);
  return {
    phoneCustomers: rows.map((row): HealthflowPhoneRecoveryCustomer => ({
      id: row.id, storeId: row.storeId, storeKey: row.store.slug,
      phone: row.phone, healthProfileId: row.healthProfileId,
    })),
    secondaryCustomers: rows.map((row): SecondaryRecoveryCustomer => ({
      id: row.id, storeId: row.storeId, storeKey: row.store.slug, name: row.name,
      email: row.email, birthday: row.birthday, healthProfileId: row.healthProfileId,
    })),
    existing: existing satisfies HealthflowPhoneRecoveryExisting[],
  };
}

function validateArguments() {
  if (expectedPending !== null && (!Number.isSafeInteger(expectedPending) || expectedPending < 0)) {
    throw new Error("expected-pending 必須是非負整數");
  }
  if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("expected-plan-sha256 必須是 SHA-256");
  }
  if (execute && (!confirmed || expectedPending === null || !expectedDigest)) {
    throw new Error("寫入模式必須提供確認旗標、唯讀預檢筆數與計畫 SHA-256");
  }
}

async function buildPlan(input: {
  profileRows: ProfileRow[];
  storeRows: StoreRow[];
  recordRows: BodyRecordRow[];
  steamfoot: Awaited<ReturnType<typeof loadSteamfootState>>;
}) {
  const storeNames = new Map(input.storeRows.map((store) => [store.id, store.name]));
  const storeSlugs: Record<string, string> = { 暖暖蒸足: "zhubei", 暖沐蒸足: "taichung" };
  const storeKeyFor = (row: ProfileRow) => row.store_id
    ? storeSlugs[storeNames.get(row.store_id) ?? ""] ?? null
    : null;
  const records: SecondaryRecoveryRecord[] = input.recordRows.map((row) => ({ id: row.id, userId: row.user_id }));
  const phonePlan = planHealthflowPhoneRecovery({
    profiles: input.profileRows.map((row) => ({
      id: row.id, phone: row.phone, phoneNormalized: row.phone_normalized, storeKey: storeKeyFor(row),
    })),
    customers: input.steamfoot.phoneCustomers,
    records,
    existing: input.steamfoot.existing,
  });
  const eligibleProfileIds = new Set(
    phonePlan.skippedProfiles
      .filter((item) => item.reason === "missing_target")
      .map((item) => item.profileId)
      .filter((id) => {
        const row = input.profileRows.find((profile) => profile.id === id);
        return row ? Boolean(storeKeyFor(row)) : false;
      }),
  );
  const profiles: SecondaryRecoveryProfile[] = input.profileRows.map((row) => ({
    id: row.id, fullName: row.full_name, email: row.email, birthDate: row.birth_date,
    storeKey: storeKeyFor(row),
  }));
  return planHealthflowSecondaryRecovery({
    profiles, eligibleProfileIds, customers: input.steamfoot.secondaryCustomers,
    records, existing: input.steamfoot.existing,
  });
}

async function main() {
  validateArguments();
  const [profileRows, storeRows, recordRows, steamfoot] = await Promise.all([
    fetchAll<ProfileRow>("profiles", "id,full_name,phone,phone_normalized,email,birth_date,store_id"),
    fetchAll<StoreRow>("stores", "id,name"),
    fetchAll<BodyRecordRow>(
      "body_records",
      "id,user_id,measured_at,weight,bmi,body_fat,muscle_mass,bone_mass,visceral_fat,bmr,body_water,metabolic_age,note",
    ),
    loadSteamfootState(prisma),
  ]);
  if (new Set(recordRows.map((record) => record.id)).size !== recordRows.length) {
    throw new Error("來源量測 ID 不唯一，已停止");
  }
  const profileIds = new Set(profileRows.map((profile) => profile.id));
  if (recordRows.some((record) => !profileIds.has(record.user_id))) {
    throw new Error("來源量測引用不存在的 profile，已停止");
  }

  const plan = await buildPlan({ profileRows, storeRows, recordRows, steamfoot });
  if (expectedPending !== null && plan.summary.pendingRecords !== expectedPending) {
    throw new Error("待補筆數與核准預檢不同，已停止");
  }
  if (expectedDigest && plan.digest !== expectedDigest) {
    throw new Error("補回計畫內容與核准預檢不同，已停止");
  }
  if (githubOutput) {
    appendFileSync(githubOutput, `pending_records=${plan.summary.pendingRecords}\nplan_digest=${plan.digest}\n`, "utf8");
  }
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run", ...plan.summary,
    privacy: "identifiers and health values redacted",
  }));
  if (!execute || plan.summary.pendingRecords === 0) return;

  const recordsById = new Map(recordRows.map((record) => [record.id, record]));
  const importRows = plan.mappings.flatMap((mapping) => mapping.pendingSourceRecordIds.map((id) => {
    const record = recordsById.get(id);
    if (!record) throw new Error("補回計畫引用不存在的來源量測");
    const measuredAt = parseHealthflowMeasurementDate(record.measured_at.slice(0, 10));
    if (!measuredAt) throw new Error("來源資料含無效量測日期，已停止");
    return {
      storeId: mapping.storeId, customerId: mapping.customerId, measuredAt,
      weight: record.weight, bmi: record.bmi, bodyFat: record.body_fat,
      muscleMass: record.muscle_mass, boneMass: record.bone_mass,
      visceralFat: record.visceral_fat, bmr: record.bmr, bodyWater: record.body_water,
      metabolicAge: record.metabolic_age, note: record.note,
      source: "HEALTHFLOW", sourceRecordId: record.id,
    };
  }));

  const result = await prisma.$transaction(async (tx) => {
    const currentPlan = await buildPlan({
      profileRows, storeRows, recordRows,
      steamfoot: await loadSteamfootState(tx as unknown as PrismaClient),
    });
    if (currentPlan.digest !== plan.digest || currentPlan.summary.pendingRecords !== plan.summary.pendingRecords) {
      throw new Error("交易前顧客或健康資料已變動，已停止");
    }
    const created = await tx.customerHealthRecord.createMany({ data: importRows, skipDuplicates: true });
    const expectedById = new Map(importRows.map((row) => [row.sourceRecordId, row]));
    const after = await tx.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW", sourceRecordId: { in: [...expectedById.keys()] } },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    });
    if (after.length !== importRows.length || after.some((row) => {
      const expected = row.sourceRecordId ? expectedById.get(row.sourceRecordId) : null;
      return !expected || expected.customerId !== row.customerId || expected.storeId !== row.storeId;
    })) throw new Error("補回後對應驗證失敗，交易已回滾");
    return { created: created.count, verified: after.length };
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ status: "verified", ...result }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
