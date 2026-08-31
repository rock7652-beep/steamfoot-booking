import { PrismaClient } from "@prisma/client";
import { parseHealthflowMeasurementDate } from "../src/lib/healthflow-phone-recovery";
import { normalizePersonName } from "../src/lib/healthflow-import-reconciliation";

const prisma = new PrismaClient();
const customerId = process.env.CUSTOMER_ID;
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;
const execute = process.argv.includes("--execute");
const allowUniqueNameStore = process.argv.includes("--allow-unique-name-store");

type Profile = { id: string; full_name: string | null; store_id: string | null };
type Store = { id: string; name: string };
type RecordRow = {
  id: string; user_id: string; measured_at: string;
  weight: number | null; bmi: number | null; body_fat: number | null;
  muscle_mass: number | null; bone_mass: number | null;
  visceral_fat: number | null; bmr: number | null;
  body_water: number | null; metabolic_age: number | null; note: string | null;
};

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  if (!baseUrl || !serviceKey) throw new Error("缺少 HealthFlow 正式連線設定");
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", "500");
    const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!response.ok) throw new Error(`${table} 讀取失敗 (${response.status})`);
    const page = await response.json() as T[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

const same = (a: number | null, b: number | null) => a === b;

async function main() {
  if (!customerId) throw new Error("缺少 CUSTOMER_ID");
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, storeId: true, healthProfileId: true, mergedIntoCustomerId: true,
      store: { select: { name: true } },
      healthRecords: { where: { source: "STEAMFOOT" }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], take: 1 },
    },
  });
  if (!customer || customer.mergedIntoCustomerId || customer.healthRecords.length !== 1) throw new Error("找不到唯一有效顧客或原生量測");
  const native = customer.healthRecords[0];
  const [profiles, stores, records] = await Promise.all([
    fetchAll<Profile>("profiles", "id,full_name,store_id"),
    fetchAll<Store>("stores", "id,name"),
    fetchAll<RecordRow>("body_records", "id,user_id,measured_at,weight,bmi,body_fat,muscle_mass,bone_mass,visceral_fat,bmr,body_water,metabolic_age,note"),
  ]);
  const storeNameById = new Map(stores.map((row) => [row.id, row.name]));
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const nativeDate = native.measuredAt.toISOString().slice(0, 10);
  const fingerprintCandidates = records.filter((row) => {
    const profile = profileById.get(row.user_id);
    return row.measured_at.slice(0, 10) === nativeDate
      && profile?.store_id != null
      && storeNameById.get(profile.store_id) === customer.store.name
      && same(row.weight, native.weight) && same(row.bmi, native.bmi)
      && same(row.body_fat, native.bodyFat) && same(row.muscle_mass, native.muscleMass)
      && same(row.metabolic_age, native.metabolicAge);
  });
  let profileId: string | null = fingerprintCandidates.length === 1 ? fingerprintCandidates[0].user_id : null;
  let matchedFingerprintRecordId: string | null = fingerprintCandidates.length === 1 ? fingerprintCandidates[0].id : null;
  let matchMethod = "fingerprint";
  if (!profileId && allowUniqueNameStore) {
    const normalizedName = normalizePersonName(customer.name);
    const sameStoreCustomers = await prisma.customer.count({
      where: { storeId: customer.storeId, mergedIntoCustomerId: null, name: customer.name },
    });
    const nameProfiles = profiles.filter((profile) => profile.store_id != null
      && storeNameById.get(profile.store_id) === customer.store.name
      && normalizePersonName(profile.full_name) === normalizedName);
    if (sameStoreCustomers === 1 && nameProfiles.length === 1) {
      profileId = nameProfiles[0].id;
      matchMethod = "unique_name_store";
    }
  }
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", matchMethod: profileId ? matchMethod : "none", uniqueProfile: Boolean(profileId) }));
  if (!profileId) throw new Error("量測指紋及門市同名皆無唯一匹配，已停止且未寫入");
  if (customer.healthProfileId && customer.healthProfileId !== profileId) throw new Error("既有健康身分不同，已停止且未寫入");
  const profileRecords = records.filter((row) => row.user_id === profileId);
  const importSourceRecords = profileRecords.filter((row) => row.id !== matchedFingerprintRecordId);
  const sourceIds = importSourceRecords.map((row) => row.id);
  const conflicts = sourceIds.length ? await prisma.customerHealthRecord.findMany({
    where: { source: "HEALTHFLOW", sourceRecordId: { in: sourceIds }, NOT: { customerId } }, select: { id: true },
  }) : [];
  if (conflicts.length) throw new Error("來源紀錄已綁到其他顧客，已停止且未寫入");
  if (!execute) {
    console.log(JSON.stringify({ status: "unique", historyRecords: importSourceRecords.length, preservedNativeRecords: 1 }));
    return;
  }
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id: customerId }, select: { healthProfileId: true } });
    if (!current || (current.healthProfileId && current.healthProfileId !== profileId)) throw new Error("交易前身分已變動");
    const linked = await tx.customer.updateMany({
      where: { id: customerId, OR: [{ healthProfileId: null }, { healthProfileId: profileId }] },
      data: { healthProfileId: profileId, healthLinkStatus: "linked", healthSyncedAt: new Date() },
    });
    if (linked.count !== 1) throw new Error("健康身分綁定失敗");
    const created = await tx.customerHealthRecord.createMany({
      data: importSourceRecords.map((row) => {
        const measuredAt = parseHealthflowMeasurementDate(row.measured_at.slice(0, 10));
        if (!measuredAt) throw new Error("來源量測日期無效");
        return { storeId: customer.storeId, customerId, measuredAt, weight: row.weight, bmi: row.bmi,
          bodyFat: row.body_fat, muscleMass: row.muscle_mass, boneMass: row.bone_mass,
          visceralFat: row.visceral_fat, bmr: row.bmr, bodyWater: row.body_water,
          metabolicAge: row.metabolic_age, note: row.note, source: "HEALTHFLOW", sourceRecordId: row.id };
      }), skipDuplicates: true,
    });
    return { created: created.count };
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ status: "verified", ...result, preservedNativeRecords: 1, expectedHistoryRecords: importSourceRecords.length }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
