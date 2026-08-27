/**
 * Import only a previously approved HealthFlow safe-match plan.
 *
 * Required safeguards:
 * - explicit execute + confirmation flags
 * - exact pending count and SHA-256 from a fresh read-only audit
 * - plan recomputed inside the transaction
 * - source IDs and target mappings verified before commit
 * - post-commit total and remaining counts verified
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { parseHealthflowMeasurementDate } from "../src/lib/healthflow-phone-recovery";
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
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-approved-safe-match-import");

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const expectedPendingValue = arg("expected-pending");
const expectedPending = expectedPendingValue === null ? null : Number(expectedPendingValue);
const expectedDigest = arg("expected-plan-sha256");
const expectedRemainingAfterValue = arg("expected-remaining-after");
const expectedRemainingAfter = expectedRemainingAfterValue === null
  ? null
  : Number(expectedRemainingAfterValue);
const expectedTotalAfterValue = arg("expected-total-after");
const expectedTotalAfter = expectedTotalAfterValue === null ? null : Number(expectedTotalAfterValue);

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

type DbClient = Pick<PrismaClient, "customer" | "customerHealthRecord">;

async function loadSteamfootState(client: DbClient) {
  const [customers, existing] = await Promise.all([
    client.customer.findMany({
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
    client.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW" },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    }),
  ]);
  return {
    customers: customers.map((customer): SafeMatchCustomer => ({
      id: customer.id,
      storeId: customer.storeId,
      storeKey: customer.store.slug,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday,
      healthProfileId: customer.healthProfileId,
    })),
    existing: existing satisfies SafeMatchExisting[],
  };
}

function validateArguments() {
  const counts = [expectedPending, expectedRemainingAfter, expectedTotalAfter];
  if (counts.some((value) => value === null || !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("必須提供所有已核准的非負整數筆數");
  }
  if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("必須提供已核准的計畫 SHA-256");
  }
  if (!execute || !confirmed) {
    throw new Error("正式匯入必須提供 execute 與明確確認旗標");
  }
}

function assertApprovedPlan(plan: ReturnType<typeof planHealthflowSafeMatches>) {
  if (plan.summary.safeRecords !== expectedPending) {
    throw new Error("安全候選筆數與核准結果不同，已停止");
  }
  if (plan.digest !== expectedDigest) {
    throw new Error("安全對應內容與核准 SHA-256 不同，已停止");
  }
}

function buildSourceState(input: {
  profileRows: ProfileRow[];
  storeRows: StoreRow[];
  recordRows: BodyRecordRow[];
}) {
  const storeNames = new Map(input.storeRows.map((store) => [store.id, store.name]));
  const steamfootSlugByHealthflowStore: Record<string, string> = {
    以斯帖蒸足: "hsinchu",
    暖暖蒸足: "zhubei",
    暖沐蒸足: "taichung",
  };
  const profiles: SafeMatchProfile[] = input.profileRows.map((profile) => ({
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
  const records: SafeMatchRecord[] = input.recordRows.map((record) => ({
    id: record.id,
    userId: record.user_id,
  }));
  return { profiles, records };
}

async function main() {
  validateArguments();
  const [profileRows, storeRows, recordRows, steamfoot] = await Promise.all([
    fetchAll<ProfileRow>(
      "profiles",
      "id,full_name,phone,phone_normalized,email,birth_date,store_id",
    ),
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
  const sourceRecordIds = new Set(recordRows.map((record) => record.id));
  if (steamfoot.existing.some((row) => !row.sourceRecordId || !sourceRecordIds.has(row.sourceRecordId))) {
    throw new Error("蒸管家既有 HEALTHFLOW 紀錄無法回溯來源，已停止");
  }

  const source = buildSourceState({ profileRows, storeRows, recordRows });
  const plan = planHealthflowSafeMatches({ ...source, ...steamfoot });
  assertApprovedPlan(plan);

  const recordsById = new Map(recordRows.map((record) => [record.id, record]));
  const importRows = plan.mappings.flatMap((mapping) =>
    mapping.pendingSourceRecordIds.map((sourceRecordId) => {
      const record = recordsById.get(sourceRecordId);
      if (!record) throw new Error("核准計畫引用不存在的來源量測，已停止");
      const measuredAt = parseHealthflowMeasurementDate(record.measured_at.slice(0, 10));
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
        sourceRecordId,
      };
    }),
  );
  if (importRows.length !== expectedPending) {
    throw new Error("準備匯入筆數與核准筆數不同，已停止");
  }

  const result = await prisma.$transaction(async (tx) => {
    const currentSteamfoot = await loadSteamfootState(tx as unknown as DbClient);
    const currentPlan = planHealthflowSafeMatches({ ...source, ...currentSteamfoot });
    assertApprovedPlan(currentPlan);

    const created = await tx.customerHealthRecord.createMany({
      data: importRows,
      skipDuplicates: true,
    });
    if (created.count !== expectedPending) {
      throw new Error("交易期間資料已變動，新增筆數不符，已回滾");
    }

    const expectedBySourceId = new Map(
      importRows.map((row) => [row.sourceRecordId, row]),
    );
    const inserted = await tx.customerHealthRecord.findMany({
      where: {
        source: "HEALTHFLOW",
        sourceRecordId: { in: [...expectedBySourceId.keys()] },
      },
      select: { sourceRecordId: true, customerId: true, storeId: true },
    });
    if (
      inserted.length !== expectedPending ||
      inserted.some((row) => {
        const expected = row.sourceRecordId
          ? expectedBySourceId.get(row.sourceRecordId)
          : null;
        return !expected || expected.customerId !== row.customerId || expected.storeId !== row.storeId;
      })
    ) {
      throw new Error("匯入後對應驗證失敗，已回滾");
    }
    return { created: created.count, verified: inserted.length };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 120_000,
  });

  const afterState = await loadSteamfootState(prisma);
  const afterPlan = planHealthflowSafeMatches({ ...source, ...afterState });
  if (afterState.existing.length !== expectedTotalAfter) {
    throw new Error("匯入後蒸管家 HEALTHFLOW 總筆數不符");
  }
  if (afterPlan.summary.remainingRecords !== expectedRemainingAfter) {
    throw new Error("匯入後剩餘筆數不符");
  }
  if (afterPlan.summary.safeRecords !== 0) {
    throw new Error("核准的安全候選仍有未補入紀錄");
  }

  console.log(JSON.stringify({
    status: "imported-and-verified",
    ...result,
    totalHealthflowRecordsInSteamfoot: afterState.existing.length,
    remainingSourceRecords: afterPlan.summary.remainingRecords,
    privacy: "aggregate counts only",
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
