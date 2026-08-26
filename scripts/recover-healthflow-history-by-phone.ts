/**
 * HealthFlow -> 蒸管家缺漏健康歷史安全補回。
 *
 * Matching rules:
 * - known source store: unique phone in the same store on both sides
 * - missing/legacy source store: unique phone across all Steamfoot stores
 * - an existing different healthProfileId, ambiguous phone, store conflict, or
 *   conflicting sourceRecordId is never auto-recovered
 *
 * Dry-run is the default. Execute requires the exact dry-run count and digest.
 * Logs contain aggregate counts only—never names, phones, profile IDs, record
 * IDs, or health metric values.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  parseHealthflowMeasurementDate,
  planHealthflowPhoneRecovery,
  type HealthflowPhoneRecoveryCustomer,
  type HealthflowPhoneRecoveryExisting,
  type HealthflowPhoneRecoveryProfile,
  type HealthflowPhoneRecoveryRecord,
} from "../src/lib/healthflow-phone-recovery";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-unique-phone-recovery");
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return (
    process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

const expectedPendingArg = arg("expected-pending");
const expectedPending =
  expectedPendingArg === null ? null : Number(expectedPendingArg);
const expectedDigest = arg("expected-plan-sha256");
const githubOutput = arg("github-output");
const reviewOutput = arg("review-output");

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  phone_normalized: string | null;
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
  if (!baseUrl || !serviceKey) {
    throw new Error("缺少 HealthFlow 正式連線設定");
  }
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
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function validateArguments() {
  if (
    expectedPending !== null &&
    (!Number.isSafeInteger(expectedPending) || expectedPending < 0)
  ) {
    throw new Error("expected-pending 必須是非負整數");
  }
  if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("expected-plan-sha256 必須是 SHA-256");
  }
  if (
    execute &&
    (!confirmed || expectedPending === null || !expectedDigest)
  ) {
    throw new Error(
      "寫入模式必須提供確認旗標、唯讀預檢筆數與計畫 SHA-256",
    );
  }
}

function assertPlanExpectation(plan: {
  digest: string;
  summary: { pendingRecords: number };
}) {
  if (
    expectedPending !== null &&
    plan.summary.pendingRecords !== expectedPending
  ) {
    throw new Error("待補筆數與核准預檢不同，已停止");
  }
  if (expectedDigest && plan.digest !== expectedDigest) {
    throw new Error("補回計畫內容與核准預檢不同，已停止");
  }
}

function writeGithubOutput(plan: {
  digest: string;
  summary: { pendingRecords: number };
}) {
  if (!githubOutput) return;
  appendFileSync(
    githubOutput,
    `pending_records=${plan.summary.pendingRecords}\nplan_digest=${plan.digest}\n`,
    "utf8",
  );
}

async function loadSteamfootState(
  client: Pick<PrismaClient, "customer" | "customerHealthRecord">,
) {
  const [customers, existing] = await Promise.all([
    client.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: {
        id: true,
        storeId: true,
        phone: true,
        healthProfileId: true,
        store: { select: { slug: true } },
      },
    }),
    client.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW" },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    }),
  ]);
  return {
    customers: customers.map(
      (customer): HealthflowPhoneRecoveryCustomer => ({
        id: customer.id,
        storeId: customer.storeId,
        storeKey: customer.store.slug,
        phone: customer.phone,
        healthProfileId: customer.healthProfileId,
      }),
    ),
    existing: existing satisfies HealthflowPhoneRecoveryExisting[],
  };
}

async function main() {
  validateArguments();

  const [profileRows, storeRows, recordRows, steamfoot] = await Promise.all([
    fetchAll<ProfileRow>("profiles", "id,full_name,phone,phone_normalized,store_id"),
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

  const healthflowStoreNames = new Map(
    storeRows.map((store) => [store.id, store.name]),
  );
  const storeSlugByHealthflowName: Record<string, string> = {
    以斯帖蒸足: "hsinchu",
    暖暖蒸足: "zhubei",
    暖沐蒸足: "taichung",
  };
  const profiles: HealthflowPhoneRecoveryProfile[] = profileRows.map(
    (profile) => ({
      id: profile.id,
      phone: profile.phone,
      phoneNormalized: profile.phone_normalized,
      storeKey: profile.store_id
        ? storeSlugByHealthflowName[
            healthflowStoreNames.get(profile.store_id) ?? ""
          ] ?? null
        : null,
    }),
  );
  const records: HealthflowPhoneRecoveryRecord[] = recordRows.map((record) => ({
    id: record.id,
    userId: record.user_id,
  }));

  const plan = planHealthflowPhoneRecovery({
    profiles,
    records,
    ...steamfoot,
  });
  if (reviewOutput) {
    const sourceById = new Map(profileRows.map((row) => [row.id, row]));
    const maskPhone = (value: string | null) => {
      const digits = value?.replace(/\D/g, "") ?? "";
      return digits.length >= 7
        ? `${digits.slice(0, 4)}***${digits.slice(-3)}`
        : value
          ? "格式無效"
          : "未提供";
    };
    const review = plan.skippedProfiles.map((item, index) => {
      const source = sourceById.get(item.profileId);
      return {
        sequence: index + 1,
        store: source?.store_id
          ? healthflowStoreNames.get(source.store_id) ?? "未知門市"
          : "舊資料未標門市",
        name: source?.full_name?.trim() || "未提供姓名",
        maskedPhone: maskPhone(source?.phone_normalized ?? source?.phone ?? null),
        recordCount: item.recordCount,
        reason: item.reason,
      };
    });
    writeFileSync(reviewOutput, JSON.stringify(review, null, 2), "utf8");
  }
  assertPlanExpectation(plan);
  writeGithubOutput(plan);
  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      ...plan.summary,
      privacy: "identifiers and health values redacted",
    }),
  );
  if (!execute || plan.summary.pendingRecords === 0) return;

  const recordsById = new Map(recordRows.map((record) => [record.id, record]));
  const importRows = plan.mappings.flatMap((mapping) =>
    mapping.pendingSourceRecordIds.map((sourceRecordId) => {
      const record = recordsById.get(sourceRecordId);
      if (!record) throw new Error("補回計畫引用不存在的來源量測");
      const measuredAt = parseHealthflowMeasurementDate(
        record.measured_at.slice(0, 10),
      );
      if (!measuredAt) throw new Error("來源資料含無效量測日期，已停止");
      return {
        storeId: mapping.storeId,
        customerId: mapping.customerId,
        measuredAt,
        weight: record.weight,
        bmi: record.bmi,
        bodyFat: record.body_fat,
        muscleMass: record.muscle_mass,
        boneMass: record.bone_mass,
        visceralFat: record.visceral_fat,
        bmr: record.bmr,
        bodyWater: record.body_water,
        metabolicAge: record.metabolic_age,
        note: record.note,
        source: "HEALTHFLOW",
        sourceRecordId: record.id,
      };
    }),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const currentState = await loadSteamfootState(tx as unknown as PrismaClient);
      const currentPlan = planHealthflowPhoneRecovery({
        profiles,
        records,
        ...currentState,
      });
      if (
        currentPlan.digest !== plan.digest ||
        currentPlan.summary.pendingRecords !== plan.summary.pendingRecords
      ) {
        throw new Error("交易前顧客或健康資料已變動，已停止");
      }

      const created = await tx.customerHealthRecord.createMany({
        data: importRows,
        skipDuplicates: true,
      });
      const sourceRecordIds = importRows.map((row) => row.sourceRecordId);
      const after = await tx.customerHealthRecord.findMany({
        where: {
          source: "HEALTHFLOW",
          sourceRecordId: { in: sourceRecordIds },
        },
        select: { sourceRecordId: true, customerId: true, storeId: true },
      });
      const expectedBySourceId = new Map(
        importRows.map((row) => [
          row.sourceRecordId,
          { customerId: row.customerId, storeId: row.storeId },
        ]),
      );
      if (
        after.length !== sourceRecordIds.length ||
        after.some((row) => {
          const expected = row.sourceRecordId
            ? expectedBySourceId.get(row.sourceRecordId)
            : null;
          return (
            !expected ||
            expected.customerId !== row.customerId ||
            expected.storeId !== row.storeId
          );
        })
      ) {
        throw new Error("補回後對應驗證失敗，交易已回滾");
      }
      return { created: created.count, verified: after.length };
    },
    { timeout: 120_000 },
  );

  console.log(JSON.stringify({ status: "verified", ...result }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
