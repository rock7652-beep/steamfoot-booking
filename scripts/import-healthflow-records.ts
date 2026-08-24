/**
 * HealthFlow -> 蒸管家健康歷史一次性匯入。
 *
 * 預設只 dry-run：
 *   HEALTHFLOW_SUPABASE_URL=... HEALTHFLOW_SERVICE_ROLE_KEY=... npx tsx scripts/import-healthflow-records.ts
 * 真正寫入必須明確加雙重確認：
 *   ... npx tsx scripts/import-healthflow-records.ts --execute --confirm-native-health-import
 *
 * 只依既有、已確認的 Customer.healthProfileId 對應；
 * 電話只產生去識別化的人工複核統計，不會自動綁定或匯入。
 */
import { PrismaClient } from "@prisma/client";
import { reconcileHealthflowImport } from "../src/lib/healthflow-import-reconciliation";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-native-health-import");
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

type ProfileRow = {
  id: string;
  phone: string | null;
  phone_normalized: string | null;
};
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

  const [customers, profiles, records] = await Promise.all([
    prisma.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: { id: true, storeId: true, healthProfileId: true, phone: true },
    }),
    // 正式 HealthFlow schema 沒有 steamfoot_customer_id；唯一自動對應來源是
    // 蒸管家既有、已人工／流程確認過的 Customer.healthProfileId。
    fetchAll<ProfileRow>("profiles", "id,phone,phone_normalized"),
    fetchAll<BodyRecordRow>(
      "body_records",
      "id,user_id,measured_at,weight,bmi,body_fat,muscle_mass,bone_mass,visceral_fat,bmr,body_water,metabolic_age,note",
    ),
  ]);

  const reconciliation = reconcileHealthflowImport(
    customers,
    profiles.map((profile) => ({
      id: profile.id,
      phone: profile.phone,
      phoneNormalized: profile.phone_normalized,
    })),
    records.map((record) => ({ userId: record.user_id })),
  );
  const profileToCustomer = reconciliation.confirmedProfileToCustomer;
  const matched = records.filter((record) => profileToCustomer.has(record.user_id));

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    ...reconciliation.summary,
    safety: "phoneReview candidates are report-only and are never auto-linked or imported",
  }, null, 2));

  if (reconciliation.summary.duplicateConfirmedProfileIds > 0) {
    throw new Error("偵測到重複 healthProfileId，已停止匯入以避免錯綁");
  }

  if (!execute) return;

  let imported = 0;
  for (const record of matched) {
    const customer = profileToCustomer.get(record.user_id)!;
    await prisma.customerHealthRecord.upsert({
      where: { uq_health_source_record: { source: "HEALTHFLOW", sourceRecordId: record.id } },
      update: {},
      create: {
        storeId: customer.storeId,
        customerId: customer.id,
        measuredAt: new Date(`${record.measured_at.slice(0, 10)}T00:00:00.000Z`),
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
      },
    });
    imported += 1;
  }
  console.log(JSON.stringify({ importedOrAlreadyPresent: imported }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
