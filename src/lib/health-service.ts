/**
 * HealthDataService — AI 健康評估系統 API 串接
 *
 * 功能：
 * 1. lookupHealthProfile(email?, phone?) — 以 email/phone 查詢 profile
 * 2. getHealthSummary(profileId) — 取得健康評估摘要（帶 5 分鐘快取）
 * 3. generateBusinessInsights(summary) — 生成經營提示
 */

const HEALTH_API_BASE = process.env.HEALTH_API_URL || "";
const HEALTH_API_KEY = process.env.HEALTH_API_KEY || "";
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘
const CACHE_MAX_SIZE = 500; // LRU 上限

// ============================================================
// Types
// ============================================================

export interface HealthProfile {
  id: string;
  fullName: string | null;
  gender: string | null;
  age: number | null;
  height: number | null;
  emailHint: string | null;
  phoneHint: string | null;
}

export interface HealthRecord {
  measuredAt: string;
  weight: number | null;
  bmi: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  boneMass: number | null;
  visceralFat: number | null;
  bmr: number | null;
  bodyWater: number | null;
  metabolicAge: number | null;
  note: string | null;
}

export interface TrendPoint {
  measuredAt: string;
  weight: number | null;
  bodyFat: number | null;
  bmi: number | null;
  muscleMass: number | null;
  visceralFat: number | null;
}

export interface HealthAlert {
  metric: string;
  status: "normal" | "warning" | "danger";
  label: string;
  message: string;
}

export interface HealthSummary {
  latest: HealthRecord | null;
  trend: TrendPoint[];
  alerts: HealthAlert[];
  meta: {
    totalRecords: number;
    daysSinceLastMeasure: number | null;
    firstMeasuredAt: string | null;
  };
}

export interface BusinessInsight {
  type: "positive" | "warning" | "danger";
  message: string;
}

// ============================================================
// LRU Cache
// ============================================================

interface CacheEntry {
  data: HealthSummary;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string): HealthSummary | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Move to end (LRU refresh)
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function setCache(key: string, data: HealthSummary): void {
  // LRU eviction
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** 手動清除特定 profileId 的快取 */
export function invalidateHealthCache(profileId: string): void {
  cache.delete(`health:summary:${profileId}`);
}

// ============================================================
// API Client
// ============================================================

class HealthApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthApiError";
  }
}

async function healthFetch<T>(path: string): Promise<T> {
  if (!HEALTH_API_BASE || !HEALTH_API_KEY) {
    throw new HealthApiError("HEALTH_API_URL or HEALTH_API_KEY not configured");
  }

  const res = await fetch(`${HEALTH_API_BASE}${path}`, {
    headers: { "X-API-Key": HEALTH_API_KEY },
    // 不用 Next.js cache，我們自己管快取
    cache: "no-store",
  });

  if (!res.ok) {
    throw new HealthApiError(`API ${path} returned ${res.status}`);
  }

  return (await res.json()) as T;
}

// ============================================================
// Public API
// ============================================================

/**
 * 以 email 或 phone 查詢AI 健康評估系統的 profile
 */
export async function lookupHealthProfile(
  email?: string | null,
  phone?: string | null
): Promise<{ found: boolean; profiles: HealthProfile[] }> {
  const params = new URLSearchParams();
  if (email) params.set("email", email.trim().toLowerCase());
  if (phone) params.set("phone", phone.trim());

  if (!params.toString()) {
    return { found: false, profiles: [] };
  }

  const result = await healthFetch<{
    found: boolean;
    profiles?: HealthProfile[];
  }>(`/api/health/profile?${params}`);

  return {
    found: result.found,
    profiles: result.profiles || [],
  };
}

/**
 * 取得AI 健康評估摘要（帶 5 分鐘 LRU 快取）
 */
export async function getHealthSummary(
  profileId: string
): Promise<HealthSummary | null> {
  const cacheKey = `health:summary:${profileId}`;

  // 快取命中
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 打 API — 若失敗會 throw，由呼叫端 safeApi 處理
  const result = await healthFetch<HealthSummary>(
    `/api/health/summary?profileId=${profileId}`
  );

  setCache(cacheKey, result);
  return result;
}

/**
 * 根據AI 健康評估摘要生成經營提示
 */
export function generateBusinessInsights(
  summary: HealthSummary
): BusinessInsight[] {
  const insights: BusinessInsight[] = [];
  const { meta, alerts, trend } = summary;

  if (!summary.latest) {
    return [{ type: "warning", message: "尚無量測紀錄" }];
  }

  // 1. 量測頻率提示
  if (meta.daysSinceLastMeasure !== null) {
    if (meta.daysSinceLastMeasure <= 14) {
      insights.push({ type: "positive", message: "近期有量測紀錄，顧客活躍中" });
    } else if (meta.daysSinceLastMeasure <= 30) {
      insights.push({
        type: "warning",
        message: `已 ${meta.daysSinceLastMeasure} 天未量測，建議提醒回訪`,
      });
    } else {
      insights.push({
        type: "danger",
        message: `已超過 ${meta.daysSinceLastMeasure} 天未量測，可能流失`,
      });
    }
  }

  // 2. 趨勢提示（體重 / 體脂）
  if (trend.length >= 2) {
    const first = trend[0];
    const last = trend[trend.length - 1];

    if (first.weight != null && last.weight != null) {
      const weightDiff = last.weight - first.weight;
      if (weightDiff < -1) {
        insights.push({ type: "positive", message: "體重持續下降，療程見效" });
      } else if (weightDiff > 2) {
        insights.push({ type: "warning", message: "體重有上升趨勢，需關注" });
      }
    }

    if (first.bodyFat != null && last.bodyFat != null) {
      const fatDiff = last.bodyFat - first.bodyFat;
      if (fatDiff < -1) {
        insights.push({ type: "positive", message: "體脂持續改善" });
      }
    }
  }

  // 3. 警示指標提示
  const warningAlerts = alerts.filter(
    (a) => a.status === "warning" || a.status === "danger"
  );
  if (warningAlerts.length > 0) {
    const labels = warningAlerts.map((a) => a.label).join("、");
    insights.push({
      type: warningAlerts.some((a) => a.status === "danger") ? "danger" : "warning",
      message: `${labels}需關注，可推薦加強課程`,
    });
  }

  // 4. 紀錄數量提示
  if (meta.totalRecords < 3) {
    insights.push({ type: "warning", message: "紀錄較少，建議鼓勵持續追蹤" });
  }

  return insights;
}

// ============================================================
// Safe wrappers — 頁面層必須用這些，不可直接呼叫原始函式
// ============================================================

import { safeApi } from "@/lib/safe-api";

/** 安全版 lookupHealthProfile — 失敗回傳 { found: false, profiles: [] } */
export async function lookupHealthProfileSafe(
  email?: string | null,
  phone?: string | null,
  context?: { customerId?: string; storeId?: string }
) {
  return safeApi({
    name: "health.lookupProfile",
    fn: () => lookupHealthProfile(email, phone),
    fallback: { found: false as const, profiles: [] as HealthProfile[] },
    context,
  });
}

/** 安全版 getHealthSummary — 失敗回傳 null */
export async function getHealthSummarySafe(
  profileId: string,
  context?: { customerId?: string; storeId?: string }
) {
  return safeApi({
    name: "health.getSummary",
    fn: () => getHealthSummary(profileId),
    fallback: null,
    context: { ...context, customerId: context?.customerId ?? profileId },
  });
}
