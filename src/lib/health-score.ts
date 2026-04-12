/**
 * 健康評分模型 + 多維度建議產生器
 *
 * 評分來源：AI 健康評估系統的 HealthSummary（alerts + metrics + trend）
 * 建議邏輯：依指標分群（循環代謝 / 體態組成 / 代謝效率）+ 趨勢變化 + 量測頻率
 * 輸出三段式結構：風險判讀 + 護理建議 + 回訪頻率建議
 */

import type { HealthSummary, HealthAlert, TrendPoint } from "./health-service";

// ============================================================
// Types
// ============================================================

export type RiskLevel = "good" | "warning" | "danger";

/** 結構化建議輸出 */
export interface HealthAdvice {
  /** 風險判讀（一句話總結） */
  riskSummary: string;
  /** 護理建議（1~3 條） */
  careAdvice: string[];
  /** 回訪頻率建議 */
  revisitSuggestion: string;
}

export interface HealthScoreResult {
  score: number; // 0-100
  riskLevel: RiskLevel;
  riskLabel: string;
  advice: HealthAdvice;
  lastMeasuredAt: string | null;
  daysSinceLastMeasure: number | null;
}

// ============================================================
// Metric dimension grouping
// ============================================================

/** 三大維度，對應不同的健康面向 */
type Dimension = "circulation" | "composition" | "metabolism";

const DIMENSION_METRICS: Record<Dimension, string[]> = {
  circulation: ["bmr", "body_water"],
  composition: ["body_fat", "visceral_fat", "muscle_mass", "weight"],
  metabolism: ["bmi", "metabolic_age"],
};

interface DimensionStatus {
  dimension: Dimension;
  dangerMetrics: string[];
  warningMetrics: string[];
  isHealthy: boolean;
}

function analyzeDimensions(alerts: HealthAlert[]): DimensionStatus[] {
  const alertMap = new Map(alerts.map((a) => [a.metric, a]));

  return (Object.entries(DIMENSION_METRICS) as [Dimension, string[]][]).map(
    ([dimension, metrics]) => {
      const dangerMetrics: string[] = [];
      const warningMetrics: string[] = [];

      for (const m of metrics) {
        const alert = alertMap.get(m);
        if (alert?.status === "danger") dangerMetrics.push(m);
        else if (alert?.status === "warning") warningMetrics.push(m);
      }

      return {
        dimension,
        dangerMetrics,
        warningMetrics,
        isHealthy: dangerMetrics.length === 0 && warningMetrics.length === 0,
      };
    }
  );
}

// ============================================================
// Trend analysis
// ============================================================

interface TrendAnalysis {
  weightTrend: "up" | "down" | "stable" | null;
  fatTrend: "up" | "down" | "stable" | null;
  muscleTrend: "up" | "down" | "stable" | null;
  overallImproving: boolean;
}

function analyzeTrend(trend: TrendPoint[]): TrendAnalysis {
  if (trend.length < 2) {
    return { weightTrend: null, fatTrend: null, muscleTrend: null, overallImproving: false };
  }

  const first = trend[0];
  const last = trend[trend.length - 1];

  const calcTrend = (a: number | null, b: number | null): "up" | "down" | "stable" | null => {
    if (a == null || b == null) return null;
    const diff = b - a;
    if (Math.abs(diff) < 0.5) return "stable";
    return diff > 0 ? "up" : "down";
  };

  const weightTrend = calcTrend(first.weight, last.weight);
  const fatTrend = calcTrend(first.bodyFat, last.bodyFat);
  const muscleTrend = calcTrend(first.muscleMass, last.muscleMass);

  // 整體改善 = 體脂下降 or 肌肉增加 or 體重合理下降
  const overallImproving =
    fatTrend === "down" || muscleTrend === "up" || weightTrend === "down";

  return { weightTrend, fatTrend, muscleTrend, overallImproving };
}

// ============================================================
// Score calculation (unchanged logic)
// ============================================================

export function computeHealthScore(summary: HealthSummary): HealthScoreResult {
  if (!summary.latest) {
    return {
      score: 0,
      riskLevel: "warning",
      riskLabel: "需注意",
      advice: {
        riskSummary: "目前尚無量測紀錄，建議先完成一次身體組成量測以建立健康基準",
        careAdvice: ["請至門市完成第一次身體組成量測，讓我們為您建立個人化的健康檔案"],
        revisitSuggestion: "建議近日安排一次到店量測",
      },
      lastMeasuredAt: null,
      daysSinceLastMeasure: null,
    };
  }

  // ── 1. 指標分數（佔 70 分）──
  const metricScores = computeMetricScores(summary.alerts);
  const avgMetricScore =
    metricScores.length > 0
      ? metricScores.reduce((a, b) => a + b, 0) / metricScores.length
      : 75;
  const metricPart = Math.round(avgMetricScore * 0.7);

  // ── 2. 活躍分（佔 30 分）──
  const days = summary.meta.daysSinceLastMeasure ?? 999;
  let activityPart: number;
  if (days <= 7) activityPart = 30;
  else if (days <= 14) activityPart = 25;
  else if (days <= 30) activityPart = 20;
  else if (days <= 60) activityPart = 10;
  else activityPart = 5;

  const score = Math.min(100, Math.max(0, metricPart + activityPart));
  const riskLevel = scoreToRiskLevel(score);

  // ── 3. 多維度建議 ──
  const dimensions = analyzeDimensions(summary.alerts);
  const trendAnalysis = analyzeTrend(summary.trend);
  const advice = generateStructuredAdvice(
    summary,
    riskLevel,
    dimensions,
    trendAnalysis
  );

  return {
    score,
    riskLevel,
    riskLabel: RISK_LABELS[riskLevel],
    advice,
    lastMeasuredAt: summary.latest.measuredAt,
    daysSinceLastMeasure: summary.meta.daysSinceLastMeasure,
  };
}

function computeMetricScores(alerts: HealthAlert[]): number[] {
  if (alerts.length === 0) return [];
  return alerts.map((a) => {
    switch (a.status) {
      case "normal":
        return 100;
      case "warning":
        return 50;
      case "danger":
        return 10;
      default:
        return 75;
    }
  });
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "danger";
}

const RISK_LABELS: Record<RiskLevel, string> = {
  good: "良好",
  warning: "需注意",
  danger: "高風險",
};

// ============================================================
// Structured advice generation
// ============================================================

function generateStructuredAdvice(
  summary: HealthSummary,
  riskLevel: RiskLevel,
  dimensions: DimensionStatus[],
  trend: TrendAnalysis
): HealthAdvice {
  return {
    riskSummary: buildRiskSummary(riskLevel, dimensions, trend, summary),
    careAdvice: buildCareAdvice(dimensions, trend, summary),
    revisitSuggestion: buildRevisitSuggestion(riskLevel, trend, summary.meta.daysSinceLastMeasure),
  };
}

// ── 風險判讀 ──

function buildRiskSummary(
  riskLevel: RiskLevel,
  dimensions: DimensionStatus[],
  trend: TrendAnalysis,
  summary: HealthSummary
): string {
  const circ = dimensions.find((d) => d.dimension === "circulation")!;
  const comp = dimensions.find((d) => d.dimension === "composition")!;
  const meta = dimensions.find((d) => d.dimension === "metabolism")!;

  const problemAreas: string[] = [];
  if (!circ.isHealthy) problemAreas.push("循環代謝");
  if (!comp.isHealthy) problemAreas.push("體態組成");
  if (!meta.isHealthy) problemAreas.push("代謝效率");

  // 全部健康
  if (problemAreas.length === 0) {
    if (trend.overallImproving) {
      return "您的整體狀況持續進步中，各項指標都在健康範圍內，目前的保養節奏很理想";
    }
    return "近期整體狀況穩定，各項身體指標表現良好，建議維持現有的保養習慣";
  }

  // 只有一個維度有問題
  if (problemAreas.length === 1) {
    const area = problemAreas[0];
    const hasDanger = dimensions.some(
      (d) => !d.isHealthy && d.dangerMetrics.length > 0
    );

    if (hasDanger) {
      return `${area}方面的指標偏離較明顯，需要持續關注與調理，其他面向表現尚可`;
    }

    if (trend.overallImproving) {
      return `${area}方面稍有波動，但整體趨勢正在改善中，繼續保持目前的調理方向`;
    }
    return `${area}方面有些指標需要留意，建議透過規律的蒸足保養來逐步改善`;
  }

  // 多個維度有問題
  const areaText = problemAreas.join("與");
  if (trend.overallImproving) {
    return `${areaText}的部分指標仍需關注，但從近期趨勢看已有改善跡象，請持續調理`;
  }

  const days = summary.meta.daysSinceLastMeasure ?? 0;
  if (days > 30) {
    return `距離上次量測已有一段時間，${areaText}的指標需要重新評估，建議儘早回訪追蹤`;
  }

  return `${areaText}方面的指標需要積極關注，建議近期加強保養頻率，搭配生活習慣的調整`;
}

// ── 護理建議 ──

function buildCareAdvice(
  dimensions: DimensionStatus[],
  trend: TrendAnalysis,
  summary: HealthSummary
): string[] {
  const advice: string[] = [];

  const circ = dimensions.find((d) => d.dimension === "circulation")!;
  const comp = dimensions.find((d) => d.dimension === "composition")!;
  const meta = dimensions.find((d) => d.dimension === "metabolism")!;

  // 循環代謝維度
  if (circ.dangerMetrics.length > 0) {
    if (circ.dangerMetrics.includes("body_water")) {
      advice.push("體內水分明顯不足，蒸足前後請特別留意補水，日常建議少量多次飲水");
    } else {
      advice.push("基礎代謝循環偏弱，建議近期加強足部循環調理，搭配適度的有氧活動");
    }
  } else if (circ.warningMetrics.length > 0) {
    if (circ.warningMetrics.includes("body_water")) {
      advice.push("體水分稍偏低，建議蒸足保養時注意補充水分，維持身體的代謝平衡");
    } else {
      advice.push("循環代謝還有提升空間，規律的蒸足調理有助於促進足部血液循環");
    }
  }

  // 體態組成維度
  if (comp.dangerMetrics.length > 0) {
    if (comp.dangerMetrics.includes("visceral_fat")) {
      advice.push("內臟脂肪偏高需要特別留意，建議搭配飲食控制與規律蒸足，幫助代謝調節");
    } else if (comp.dangerMetrics.includes("body_fat")) {
      advice.push("體脂肪偏高，建議增加活動量並搭配定期蒸足，有助於促進脂肪代謝");
    } else if (comp.dangerMetrics.includes("muscle_mass")) {
      advice.push("肌肉量偏低，建議適度增加蛋白質攝取並搭配輕度肌力訓練");
    } else {
      advice.push("體態組成有調整空間，建議透過蒸足保養搭配均衡飲食來逐步改善");
    }
  } else if (comp.warningMetrics.length > 0) {
    // 趨勢向好時給不同文案
    if (trend.fatTrend === "down" || trend.muscleTrend === "up") {
      advice.push("體態正在朝好的方向變化，保持目前的運動與飲食節奏，持續搭配蒸足保養");
    } else if (comp.warningMetrics.includes("weight") && trend.weightTrend === "up") {
      advice.push("體重近期有上升趨勢，建議留意飲食均衡，搭配規律蒸足幫助代謝調節");
    } else {
      advice.push("體態組成部分指標稍有偏移，建議維持規律蒸足與適度運動來穩定狀態");
    }
  }

  // 代謝效率維度
  if (meta.dangerMetrics.length > 0) {
    if (meta.dangerMetrics.includes("metabolic_age")) {
      advice.push("代謝年齡偏高，透過持續的蒸足調理與生活作息調整，有助於改善整體代謝效率");
    } else {
      advice.push("BMI 超出理想範圍，建議在日常保養之外留意飲食結構與活動量的平衡");
    }
  } else if (meta.warningMetrics.length > 0) {
    if (trend.overallImproving) {
      advice.push("代謝指標雖有波動但趨勢正在好轉，保持現有的保養與生活習慣即可");
    } else {
      advice.push("代謝效率有優化空間，規律蒸足搭配充足的睡眠休息，有助於提升代謝表現");
    }
  }

  // 所有維度健康時，根據趨勢給正向建議
  if (advice.length === 0) {
    if (trend.overallImproving) {
      advice.push("各項指標持續改善中，目前的保養計畫很適合您，建議繼續維持");
    } else if (trend.muscleTrend === "down") {
      advice.push("肌肉量略有下降，建議適度增加活動量，搭配蒸足後的伸展放鬆");
    } else {
      advice.push("整體狀態良好，建議維持規律的蒸足保養節奏，留意季節變化對身體的影響");
    }
  }

  // 久站久坐提醒（補充到 2 條）
  if (advice.length < 2 && !circ.isHealthy) {
    advice.push("日常留意久站或久坐後的足部疲勞感，適時做簡單的足部伸展與按壓放鬆");
  }

  // 補水提醒（補充到 2 條）
  if (advice.length < 2) {
    const days = summary.meta.daysSinceLastMeasure ?? 0;
    if (days > 14) {
      advice.push("距上次量測有段時間了，建議下次蒸足時順便追蹤一下身體數據的變化");
    }
  }

  return advice.slice(0, 3);
}

// ── 回訪頻率建議 ──

function buildRevisitSuggestion(
  riskLevel: RiskLevel,
  trend: TrendAnalysis,
  daysSinceLastMeasure: number | null
): string {
  const days = daysSinceLastMeasure ?? 999;

  if (riskLevel === "danger") {
    if (days > 14) {
      return "建議 3～5 天內安排回訪，重新評估目前的身體狀況並調整保養計畫";
    }
    return "目前指標需要密切追蹤，建議每週安排 1～2 次蒸足調理";
  }

  if (riskLevel === "warning") {
    if (trend.overallImproving) {
      return "改善趨勢良好，建議維持每週 1 次的保養頻率，持續追蹤變化";
    }
    if (days > 21) {
      return "建議近期安排一次回訪，讓我們重新檢視您的身體變化";
    }
    return "建議每週維持 1 次蒸足保養，定期追蹤指標的改善情況";
  }

  // good
  if (trend.overallImproving) {
    return "狀態持續進步中，目前每 1～2 週保養一次的節奏很適合您";
  }
  if (days > 30) {
    return "身體狀況穩定，但已有一段時間沒有追蹤，建議 2 週內安排一次量測";
  }
  return "狀態穩定，建議每 2 週安排一次保養，維持良好的身體狀態";
}
