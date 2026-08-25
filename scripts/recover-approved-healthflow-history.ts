/**
 * Recover one explicitly approved HealthFlow profile into native health history.
 *
 * Privacy: the public workflow passes only SHA-256 digests. Names, phones,
 * profile IDs, record IDs, and metric values are never printed.
 * Safety: dry-run by default; execute requires an explicit confirmation and
 * re-checks every identity/source invariant inside one transaction.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  normalizePersonName,
  normalizeTaiwanPhone,
} from "../src/lib/healthflow-import-reconciliation";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-approved-recovery");

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const profileHash = arg("profile-sha256");
const customerNameHash = arg("customer-name-sha256");
const expectedRecords = Number(arg("expected-records"));
const targetStoreSlug = arg("store");
const baseUrl = process.env.HEALTHFLOW_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.HEALTHFLOW_SERVICE_ROLE_KEY;

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireDigest(value: string | null, label: string): string {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} 必須是 SHA-256`);
  return value;
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  if (!baseUrl || !serviceKey) throw new Error("缺少 HealthFlow 連線設定");
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
  const expectedProfileHash = requireDigest(profileHash, "profile-sha256");
  const expectedNameHash = requireDigest(customerNameHash, "customer-name-sha256");
  if (!targetStoreSlug) throw new Error("缺少 store");
  if (!Number.isSafeInteger(expectedRecords) || expectedRecords <= 0) {
    throw new Error("expected-records 必須是正整數");
  }
  if (execute && !confirmed) throw new Error("寫入模式缺少明確確認");

  const [profiles, healthflowStores, allRecords, store] = await Promise.all([
    fetchAll<ProfileRow>(
      "profiles",
      "id,full_name,phone,phone_normalized,store_id",
    ),
    fetchAll<StoreRow>("stores", "id,name"),
    fetchAll<BodyRecordRow>(
      "body_records",
      "id,user_id,measured_at,weight,bmi,body_fat,muscle_mass,bone_mass,visceral_fat,bmr,body_water,metabolic_age,note",
    ),
    prisma.store.findUnique({
      where: { slug: targetStoreSlug },
      select: { id: true, name: true },
    }),
  ]);
  if (!store) throw new Error("找不到指定蒸管家門市");

  const profileMatches = profiles.filter((profile) => sha256(profile.id) === expectedProfileHash);
  if (profileMatches.length !== 1) throw new Error("來源 profile 必須唯一命中");
  const profile = profileMatches[0];
  const sourceStoreName = healthflowStores.find((item) => item.id === profile.store_id)?.name;
  if (sourceStoreName !== store.name) throw new Error("來源與目標門市不一致");

  const normalizedPhone = normalizeTaiwanPhone(profile.phone_normalized ?? profile.phone);
  if (!normalizedPhone) throw new Error("來源電話無法安全正規化");
  const records = allRecords.filter((record) => record.user_id === profile.id);
  if (records.length !== expectedRecords) throw new Error("來源紀錄筆數與核准值不同");
  if (new Set(records.map((record) => record.id)).size !== expectedRecords) {
    throw new Error("來源紀錄 ID 不唯一");
  }

  const storeCustomers = await prisma.customer.findMany({
    where: { storeId: store.id, mergedIntoCustomerId: null },
    select: { id: true, name: true, phone: true },
  });
  const candidates = storeCustomers.filter(
    (customer) => normalizeTaiwanPhone(customer.phone) === normalizedPhone,
  );
  if (candidates.length !== 1) throw new Error("目標顧客必須在同店以電話唯一命中");
  const customer = candidates[0];
  const normalizedName = normalizePersonName(customer.name);
  if (!normalizedName || sha256(normalizedName) !== expectedNameHash) {
    throw new Error("目標顧客姓名摘要不符");
  }

  const sourceRecordIds = records.map((record) => record.id);
  const existing = await prisma.customerHealthRecord.findMany({
    where: { source: "HEALTHFLOW", sourceRecordId: { in: sourceRecordIds } },
    select: { sourceRecordId: true, customerId: true, storeId: true },
  });
  if (existing.some((row) => row.customerId !== customer.id || row.storeId !== store.id)) {
    throw new Error("來源紀錄已連到其他顧客或門市");
  }

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    targetCustomers: candidates.length,
    sourceRecords: records.length,
    alreadyRecovered: existing.length,
    pendingRecords: records.length - existing.length,
    privacy: "identifiers and health values redacted",
  }));
  if (!execute) return;

  const importRows = records.map((record) => ({
    storeId: store.id,
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
  }));

  const result = await prisma.$transaction(async (tx) => {
    const currentCustomer = await tx.customer.findFirst({
      where: { id: customer.id, storeId: store.id, mergedIntoCustomerId: null },
      select: { name: true, phone: true },
    });
    if (
      !currentCustomer ||
      normalizeTaiwanPhone(currentCustomer.phone) !== normalizedPhone ||
      sha256(normalizePersonName(currentCustomer.name) ?? "") !== expectedNameHash
    ) {
      throw new Error("交易前顧客身分已變動");
    }
    const conflicting = await tx.customerHealthRecord.findMany({
      where: { source: "HEALTHFLOW", sourceRecordId: { in: sourceRecordIds } },
      select: { customerId: true, storeId: true },
    });
    if (conflicting.some((row) => row.customerId !== customer.id || row.storeId !== store.id)) {
      throw new Error("交易前來源對應已變動");
    }
    const created = await tx.customerHealthRecord.createMany({
      data: importRows,
      skipDuplicates: true,
    });
    const verified = await tx.customerHealthRecord.count({
      where: {
        customerId: customer.id,
        storeId: store.id,
        source: "HEALTHFLOW",
        sourceRecordId: { in: sourceRecordIds },
      },
    });
    if (verified !== expectedRecords) throw new Error("補回後筆數驗證失敗");
    return { created: created.count, verified };
  });

  console.log(JSON.stringify({ status: "verified", ...result }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
