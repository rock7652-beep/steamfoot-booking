/**
 * AI 健康評估報告 — 列印/下載 PDF 專用頁面
 *
 * 路徑：/dashboard/customers/[id]/health-report
 * 使用方式：瀏覽器列印 → 儲存為 PDF
 */

import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getHealthSummarySafe } from "@/lib/health-service";
import { computeHealthScore, type RiskLevel } from "@/lib/health-score";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "./print-button";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HealthReportPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  // Feature gate: AI 健康報告 PDF 需要 GROWTH 以上方案
  await checkCurrentStoreFeature(FEATURES.AI_REPORT_PDF);

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      name: true,
      phone: true,
      email: true,
      gender: true,
      birthday: true,
      healthProfileId: true,
      healthLinkStatus: true,
    },
  });

  if (!customer || !customer.healthProfileId || customer.healthLinkStatus !== "linked") {
    notFound();
  }

  const summary = await getHealthSummarySafe(customer.healthProfileId, { customerId: id });
  if (!summary || !summary.latest) {
    notFound();
  }

  const scoreResult = computeHealthScore(summary);
  const { advice } = scoreResult;
  const trend = summary.trend;

  // 年齡
  let age: string | null = null;
  if (customer.birthday) {
    const today = new Date();
    const birth = new Date(customer.birthday);
    const y = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    const a = m < 0 || (m === 0 && today.getDate() < birth.getDate()) ? y - 1 : y;
    age = `${a} 歲`;
  }

  const reportDate = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="report-container">
      {/* Print action bar */}
      <div className="no-print" style={{
        padding: "16px 24px",
        background: "#f8f8f8",
        borderBottom: "1px solid #eee",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 14, color: "#666" }}>
          預覽健康評估報告 — 按下列印可儲存為 PDF
        </span>
        <PrintButton />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* REPORT CONTENT */}
      {/* ═══════════════════════════════════════════ */}
      <div style={{ padding: "32px 40px" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: "2px solid #e8e0d8",
        }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#2d2520", marginBottom: 4 }}>
              AI 健康評估報告
            </h1>
            <p style={{ fontSize: 13, color: "#8a7e76" }}>
              蒸足健康站 &middot; 個人化健康評估
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 12, color: "#8a7e76" }}>報告日期</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#2d2520" }}>{reportDate}</p>
          </div>
        </div>

        {/* Customer Info */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 28,
          padding: 16,
          background: "#faf8f6",
          borderRadius: 8,
        }}>
          <InfoItem label="姓名" value={customer.name} />
          <InfoItem label="性別" value={customer.gender === "MALE" ? "男" : customer.gender === "FEMALE" ? "女" : "—"} />
          <InfoItem label="年齡" value={age ?? "—"} />
          <InfoItem label="最近量測" value={scoreResult.lastMeasuredAt ?? "—"} />
          <InfoItem label="量測間隔" value={scoreResult.daysSinceLastMeasure != null ? `${scoreResult.daysSinceLastMeasure} 天前` : "—"} />
          <InfoItem label="累計紀錄" value={`${summary.meta.totalRecords} 次`} />
        </div>

        {/* Score Section */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          marginBottom: 28,
          padding: 24,
          border: "1px solid #e8e0d8",
          borderRadius: 12,
        }}>
          {/* Score visual */}
          <ScoreVisual score={scoreResult.score} riskLevel={scoreResult.riskLevel} />

          {/* Risk summary */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 8 }}>
              <RiskBadge level={scoreResult.riskLevel} label={scoreResult.riskLabel} />
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3d3530" }}>
              {advice.riskSummary}
            </p>
          </div>
        </div>

        {/* Care Advice */}
        <SectionTitle icon="&#x1F49A;" title="護理建議" />
        <div style={{ marginBottom: 28 }}>
          {advice.careAdvice.map((text, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 0",
              borderBottom: i < advice.careAdvice.length - 1 ? "1px solid #f0ebe6" : "none",
            }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#e8f0e0",
                color: "#4a7c3f",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 1,
              }}>
                {i + 1}
              </span>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: "#3d3530" }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Revisit Suggestion */}
        <div style={{
          padding: 16,
          background: "#eef4fb",
          borderRadius: 8,
          marginBottom: 28,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>&#x1F4C5;</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#2c5d8f" }}>回訪建議</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#3d3530" }}>
            {advice.revisitSuggestion}
          </p>
        </div>

        {/* Trend Chart */}
        {trend.length >= 2 && (
          <>
            <SectionTitle icon="&#x1F4C8;" title="健康趨勢" />
            <TrendSection trend={trend} currentScore={scoreResult.score} riskLevel={scoreResult.riskLevel} />
          </>
        )}

        {/* Metrics snapshot */}
        <SectionTitle icon="&#x1F4CB;" title="身體組成數據" />
        <MetricsGrid latest={summary.latest} alerts={summary.alerts} />

        {/* Placeholder: 足底熱力圖 */}
        <div style={{
          marginTop: 28,
          padding: 24,
          border: "1px dashed #d0c8c0",
          borderRadius: 8,
          textAlign: "center",
          color: "#b0a89e",
        }}>
          <p style={{ fontSize: 13, marginBottom: 4 }}>&#x1F9B6; 足底狀態分析</p>
          <p style={{ fontSize: 11 }}>（此區域將於後續版本加入足底熱力圖）</p>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 36,
          paddingTop: 16,
          borderTop: "1px solid #e8e0d8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <p style={{ fontSize: 11, color: "#8a7e76" }}>蒸足健康站 &middot; AI 健康評估系統</p>
            <p style={{ fontSize: 10, color: "#b0a89e", marginTop: 2 }}>
              本報告由 AI 分析產生，僅供健康保養參考，不構成醫療診斷或建議
            </p>
          </div>
          <p style={{ fontSize: 10, color: "#b0a89e" }}>{reportDate}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components (inline styles for print fidelity)
// ============================================================

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#8a7e76", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#2d2520" }}>{value}</p>
    </div>
  );
}

function ScoreVisual({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    good: "#4abe4a",
    warning: "#e8b84a",
    danger: "#e05050",
  };
  const color = colors[riskLevel];
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#eee" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#2d2520" }}>{score}</span>
        <span style={{ fontSize: 10, color: "#8a7e76" }}>/ 100</span>
      </div>
    </div>
  );
}

function RiskBadge({ level, label }: { level: RiskLevel; label: string }) {
  const styles: Record<RiskLevel, { bg: string; color: string; emoji: string }> = {
    good: { bg: "#e8f5e9", color: "#2e7d32", emoji: "\uD83D\uDFE2" },
    warning: { bg: "#fff8e1", color: "#f57f17", emoji: "\uD83D\uDFE1" },
    danger: { bg: "#ffebee", color: "#c62828", emoji: "\uD83D\uDD34" },
  };
  const s = styles[level];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 20,
      background: s.bg,
      color: s.color,
      fontSize: 12,
      fontWeight: 600,
    }}>
      {s.emoji} {label}
    </span>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: icon }} />
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#2d2520" }}>{title}</h2>
    </div>
  );
}

function TrendSection({
  trend,
  currentScore,
  riskLevel,
}: {
  trend: import("@/lib/health-service").TrendPoint[];
  currentScore: number;
  riskLevel: RiskLevel;
}) {
  // Build display data: metrics + score bar chart
  const points = [...trend].reverse().slice(-8); // oldest to newest, max 8
  const hasWeight = points.some((p) => p.weight != null);
  const hasFat = points.some((p) => p.bodyFat != null);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Metric cards */}
      {(hasWeight || hasFat) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}>
          {hasWeight && (() => {
            const first = points.find((p) => p.weight != null);
            const last = [...points].reverse().find((p) => p.weight != null);
            if (!first?.weight || !last?.weight) return null;
            const diff = +(last.weight - first.weight).toFixed(1);
            return (
              <TrendMetricCard
                label="體重"
                value={`${last.weight} kg`}
                change={`${diff > 0 ? "+" : ""}${diff} kg`}
                favorable={diff <= 0}
              />
            );
          })()}
          {hasFat && (() => {
            const first = points.find((p) => p.bodyFat != null);
            const last = [...points].reverse().find((p) => p.bodyFat != null);
            if (!first?.bodyFat || !last?.bodyFat) return null;
            const diff = +(last.bodyFat - first.bodyFat).toFixed(1);
            return (
              <TrendMetricCard
                label="體脂肪"
                value={`${last.bodyFat}%`}
                change={`${diff > 0 ? "+" : ""}${diff}%`}
                favorable={diff <= 0}
              />
            );
          })()}
          {(() => {
            const first = points.find((p) => p.muscleMass != null);
            const last = [...points].reverse().find((p) => p.muscleMass != null);
            if (!first?.muscleMass || !last?.muscleMass) return null;
            const diff = +(last.muscleMass - first.muscleMass).toFixed(1);
            return (
              <TrendMetricCard
                label="肌肉量"
                value={`${last.muscleMass} kg`}
                change={`${diff > 0 ? "+" : ""}${diff} kg`}
                favorable={diff >= 0}
              />
            );
          })()}
        </div>
      )}

      {/* Bar chart */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        height: 100,
        padding: "0 8px",
      }}>
        {points.map((p, i) => {
          // Approximate score from BMI/bodyFat if available
          let approxScore = 65;
          const scores: number[] = [];
          if (p.bmi != null) {
            if (p.bmi >= 18.5 && p.bmi < 24) scores.push(100);
            else if (p.bmi < 27) scores.push(60);
            else scores.push(25);
          }
          if (p.bodyFat != null) {
            if (p.bodyFat < 25) scores.push(100);
            else if (p.bodyFat < 30) scores.push(65);
            else scores.push(25);
          }
          if (scores.length > 0) {
            approxScore = Math.round(scores.reduce((a, b) => a + b) / scores.length * 0.7 + 25);
          }
          // Use actual score for last point
          const isLast = i === points.length - 1;
          const score = isLast ? currentScore : Math.min(100, approxScore);
          const height = Math.max(8, score);
          const barColor = score >= 75 ? "#4abe4a" : score >= 50 ? "#e8b84a" : "#e05050";
          const d = new Date(p.measuredAt);
          const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;

          return (
            <div key={i} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#555" }}>{score}</span>
              <div style={{
                width: "100%",
                maxWidth: 28,
                height: `${height}%`,
                background: barColor,
                borderRadius: "4px 4px 0 0",
                minHeight: 6,
              }} />
              <span style={{ fontSize: 9, color: "#999" }}>{dateLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendMetricCard({
  label, value, change, favorable,
}: {
  label: string; value: string; change: string; favorable: boolean;
}) {
  return (
    <div style={{
      padding: 12,
      border: "1px solid #e8e0d8",
      borderRadius: 8,
    }}>
      <p style={{ fontSize: 11, color: "#8a7e76", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: "#2d2520" }}>{value}</p>
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        color: favorable ? "#2e7d32" : "#e65100",
        marginTop: 2,
      }}>
        {change} {favorable ? "↓ 改善" : "↑ 留意"}
      </p>
    </div>
  );
}

function MetricsGrid({
  latest,
  alerts,
}: {
  latest: NonNullable<import("@/lib/health-service").HealthSummary["latest"]>;
  alerts: import("@/lib/health-service").HealthAlert[];
}) {
  const alertMap = new Map(alerts.map((a) => [a.metric, a]));

  const metrics = [
    { key: "weight", label: "體重", value: latest.weight, unit: "kg" },
    { key: "bmi", label: "BMI", value: latest.bmi, unit: "" },
    { key: "body_fat", label: "體脂肪", value: latest.bodyFat, unit: "%" },
    { key: "visceral_fat", label: "內臟脂肪", value: latest.visceralFat, unit: "" },
    { key: "muscle_mass", label: "肌肉量", value: latest.muscleMass, unit: "kg" },
    { key: "bmr", label: "基礎代謝", value: latest.bmr, unit: "kcal" },
    { key: "body_water", label: "體水分", value: latest.bodyWater, unit: "%" },
    { key: "metabolic_age", label: "代謝年齡", value: latest.metabolicAge, unit: "歲" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8,
      marginBottom: 8,
    }}>
      {metrics.map(({ key, label, value, unit }) => {
        const alert = alertMap.get(key);
        const isDanger = alert?.status === "danger";
        const isWarning = alert?.status === "warning";

        return (
          <div key={key} style={{
            padding: 10,
            border: `1px solid ${isDanger ? "#ffcdd2" : isWarning ? "#fff3cd" : "#e8e0d8"}`,
            borderRadius: 6,
            background: isDanger ? "#fff5f5" : isWarning ? "#fffdf0" : "#fff",
          }}>
            <p style={{ fontSize: 10, color: "#8a7e76", marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#2d2520" }}>
              {value != null ? `${value}` : "—"}
              {value != null && unit && (
                <span style={{ fontSize: 10, fontWeight: 400, color: "#8a7e76", marginLeft: 2 }}>{unit}</span>
              )}
            </p>
            {(isDanger || isWarning) && (
              <p style={{ fontSize: 9, color: isDanger ? "#c62828" : "#f57f17", marginTop: 2 }}>
                {isDanger ? "⚠ 異常" : "△ 注意"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
