/**
 * HealthFlow -> 蒸管家健康歷史一次性匯入。
 *
 * 預設只 dry-run：
 *   HEALTHFLOW_SUPABASE_URL=... HEALTHFLOW_SERVICE_ROLE_KEY=... npx tsx scripts/import-healthflow-records.ts
 * 真正寫入必須明確加雙重確認：
 *   ... npx tsx scripts/import-healthflow-records.ts --execute \
 *     --confirm-native-health-import --expected-records=431
 *
 * 只依既有、已確認的 Customer.healthProfileId 對應；
 * 電話、姓名、email、生日與店別只產生去識別化的人工複核統計，
 * 不會自動綁定或匯入。
 */
import { PrismaClient } from "@prisma/client";
import { reconcileHealthflowImport } from "../src/lib/healthflow-import-reconciliation";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-native-health-import");
const expectedRecordsArg = process.argv.find((arg) =>
  arg.startsWith("--expected-records="),
);
const expectedRecords = expectedRecordsArg
  ? Number(expectedRecordsArg.slice("--expected-records=".length))
  : null;
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

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
  if (!baseUrl || !serviceKey) throw new Error("缺少 HEALTHFLOW_SUPABASE_URL 或 HEALTHFLOW_SERVICE_ROLE_KEY");
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

async function main() {
  if (execute && !confirmed) {
    throw new Error("寫入模式必須同時提供 --execute --confirm-native-health-import");
  }
  if (
    expectedRecords !== null &&
    (!Number.isSafeInteger(expectedRecords) || expectedRecords <= 0)
  ) {
    throw new Error("--expected-records 必須是大於 0 的整數");
  }
  if (execute && expectedRecords === null) {
    throw new Error("寫入模式必須提供 --expected-records=<已驗證筆數>");
  }

  const [customers, profiles, healthflowStores, records] = await Promise.all([
    prisma.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: {
        id: true,
        storeId: true,
        healthProfileId: true,
        phone: true,
        name: true,
        email: true,
        birthday: true,
        store: { select: { slug: true } },
      },
    }),
    // 正式 HealthFlow schema 沒有 steamfoot_customer_id；唯一自動對應來源是
    // 蒸管家既有、已人工／流程確認過的 Customer.healthProfileId。
    fetchAll<ProfileRow>(
      "profiles",
      "id,full_name,phone,phone_normalized,email,birth_date,store_id",
    ),
    fetchAll<StoreRow>("stores", "id,name"),
    fetchAll<BodyRecordRow>(
      "body_records",
      "id,user_id,measured_at,weight,bmi,body_fat,muscle_mass,bone_mass,visceral_fat,bmr,body_water,metabolic_age,note",
    ),
  ]);

  const healthflowStoreNames = new Map(
    healthflowStores.map((store) => [store.id, store.name]),
  );
  const healthflowStoreToSteamfootSlug: Record<string, string> = {
    以斯帖蒸足: "hsinchu",
    暖暖蒸足: "zhubei",
    暖沐蒸足: "taichung",
  };

  const reconciliation = reconcileHealthflowImport(
    customers.map((customer) => ({
      ...customer,
      birthDate: customer.birthday,
      storeKey: customer.store.slug,
    })),
    profiles.map((profile) => ({
      id: profile.id,
      phone: profile.phone,
      phoneNormalized: profile.phone_normalized,
      fullName: profile.full_name,
      email: profile.email,
      birthDate: profile.birth_date,
      storeKey: profile.store_id
        ? healthflowStoreToSteamfootSlug[
            healthflowStoreNames.get(profile.store_id) ?? ""
          ] ?? null
        : null,
    })),
    records.map((record) => ({ userId: record.user_id })),
  );
  const profileToCustomer = reconciliation.confirmedProfileToCustomer;
  const matched = records.filter((record) => profileToCustomer.has(record.user_id));

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    ...reconciliation.summary,
    safety: "all review candidates are report-only and are never auto-linked or imported",
  }, null, 2));

  if (reconciliation.summary.duplicateConfirmedProfileIds > 0) {
    throw new Error("偵測到重複 healthProfileId，已停止匯入以避免錯綁");
  }
  if (reconciliation.summary.missingSourceProfiles > 0) {
    throw new Error("量測紀錄引用不存在的 HealthFlow profile，已停止匯入");
  }
  if (expectedRecords !== null && matched.length !== expectedRecords) {
    throw new Error(
      `已確認紀錄筆數已變動：預期 ${expectedRecords}，實際 ${matched.length}；已停止匯入`,
    );
  }

  if (!execute) return;

  const importRows = matched.map((record) => {
    const customer = profileToCustomer.get(record.user_id)!;
    const measuredAt = new Date(
      `${record.measured_at.slice(0, 10)}T00:00:00.000Z`,
    );
    if (Number.isNaN(measuredAt.getTime())) {
      throw new Error("來源資料含無效量測日期，已停止匯入");
    }
    return {
      storeId: customer.storeId,
      customerId: customer.id,
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
  });
  const expectedBySourceId = new Map(
    importRows.map((row) => [
      row.sourceRecordId,
      { customerId: row.customerId, storeId: row.storeId },
    ]),
  );

  const result = await prisma.$transaction(
    async (transaction) => {
      const existing = await transaction.customerHealthRecord.findMany({
        where: { source: "HEALTHFLOW" },
        select: { sourceRecordId: true, customerId: true, storeId: true },
      });
      for (const row of existing) {
        const expected = row.sourceRecordId
          ? expectedBySourceId.get(row.sourceRecordId)
          : null;
        if (
          !expected ||
          expected.customerId !== row.customerId ||
          expected.storeId !== row.storeId
        ) {
          throw new Error("既有 HEALTHFLOW 紀錄與本次核准清單不一致，已停止匯入");
        }
      }

      const created = await transaction.customerHealthRecord.createMany({
        data: importRows,
        skipDuplicates: true,
      });
      const after = await transaction.customerHealthRecord.findMany({
        where: { source: "HEALTHFLOW" },
        select: { sourceRecordId: true, customerId: true, storeId: true },
      });
      if (after.length !== expectedRecords) {
        throw new Error(
          `匯入後筆數驗證失敗：預期 ${expectedRecords}，實際 ${after.length}`,
        );
      }
      for (const row of after) {
        const expected = row.sourceRecordId
          ? expectedBySourceId.get(row.sourceRecordId)
          : null;
        if (
          !expected ||
          expected.customerId !== row.customerId ||
          expected.storeId !== row.storeId
        ) {
          throw new Error("匯入後對應驗證失敗，交易已回滾");
        }
      }
      return { created: created.count, verified: after.length };
    },
    { timeout: 60_000 },
  );

  console.log(JSON.stringify({ status: "verified", ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
