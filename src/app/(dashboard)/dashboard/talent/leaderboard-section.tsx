"use client";

import { useState } from "react";
import Link from "next/link";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { TalentStage } from "@prisma/client";

type Tab = "points" | "referral" | "growth";

interface PointsEntry {
  customerId: string;
  name: string;
  totalPoints: number;
  talentStage: string;
}

interface MonthlyPointsEntry {
  customerId: string;
  name: string;
  monthPoints: number;
  talentStage: string;
}

interface ReferralEntry {
  customerId: string;
  name: string;
  count: number;
  talentStage: string;
}

interface ReadinessEntry {
  customerId: string;
  customerName: string;
  score: number;
  readinessLevel: string;
  talentStage: string;
}

interface MentorEntry {
  customerId: string;
  name: string;
  partnerCount: number;
  talentStage: string;
}

interface Props {
  pointsAll: PointsEntry[];
  pointsMonth: MonthlyPointsEntry[];
  referralMonth: ReferralEntry[];
  referralConverted: ReferralEntry[];
  readinessTop: ReadinessEntry[];
  mentorTop: MentorEntry[];
}

const READINESS_LEVEL_COLORS: Record<string, string> = {
  READY: "text-green-700 bg-green-100",
  HIGH: "text-yellow-700 bg-yellow-100",
  MEDIUM: "text-blue-600 bg-blue-100",
  LOW: "text-earth-500 bg-earth-100",
};

const READINESS_LEVEL_LABELS: Record<string, string> = {
  READY: "準備就緒",
  HIGH: "接近",
  MEDIUM: "培養中",
  LOW: "初期",
};

export function LeaderboardSection({
  pointsAll,
  pointsMonth,
  referralMonth,
  referralConverted,
  readinessTop,
  mentorTop,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("points");

  const tabs: { key: Tab; label: string }[] = [
    { key: "points", label: "積分排行" },
    { key: "referral", label: "轉介紹排行" },
    { key: "growth", label: "成長排行" },
  ];

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-earth-800">排行榜</h2>
      </div>

      {/* Tab 切換 */}
      <div className="mt-3 flex gap-1 rounded-lg bg-earth-100 p-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === t.key
                ? "bg-white text-earth-900 shadow-sm"
                : "text-earth-500 hover:text-earth-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {activeTab === "points" && (
          <PointsTab allTime={pointsAll} monthly={pointsMonth} />
        )}
        {activeTab === "referral" && (
          <ReferralTab monthly={referralMonth} converted={referralConverted} />
        )}
        {activeTab === "growth" && (
          <GrowthTab readiness={readinessTop} mentors={mentorTop} />
        )}
      </div>
    </div>
  );
}

// ── Sub-tabs within each category ──

function PointsTab({
  allTime,
  monthly,
}: {
  allTime: PointsEntry[];
  monthly: MonthlyPointsEntry[];
}) {
  const [sub, setSub] = useState<"month" | "all">("month");
  return (
    <div>
      <SubTabs
        tabs={[
          { key: "month", label: "本月" },
          { key: "all", label: "累積" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "month" ? (
        <RankList
          items={monthly.map((m) => ({
            id: m.customerId,
            name: m.name,
            value: m.monthPoints,
            unit: "分",
            stage: m.talentStage,
          }))}
          emptyText="本月尚無積分紀錄"
        />
      ) : (
        <RankList
          items={allTime.map((m) => ({
            id: m.customerId,
            name: m.name,
            value: m.totalPoints,
            unit: "分",
            stage: m.talentStage,
          }))}
          emptyText="尚無積分紀錄"
        />
      )}
    </div>
  );
}

function ReferralTab({
  monthly,
  converted,
}: {
  monthly: ReferralEntry[];
  converted: ReferralEntry[];
}) {
  const [sub, setSub] = useState<"month" | "converted">("month");
  return (
    <div>
      <SubTabs
        tabs={[
          { key: "month", label: "本月轉介" },
          { key: "converted", label: "已轉換" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "month" ? (
        <RankList
          items={monthly.map((m) => ({
            id: m.customerId,
            name: m.name,
            value: m.count,
            unit: "次",
            stage: m.talentStage,
          }))}
          emptyText="本月尚無轉介紹"
        />
      ) : (
        <RankList
          items={converted.map((m) => ({
            id: m.customerId,
            name: m.name,
            value: m.count,
            unit: "次",
            stage: m.talentStage,
          }))}
          emptyText="尚無已轉換轉介紹"
        />
      )}
    </div>
  );
}

function GrowthTab({
  readiness,
  mentors,
}: {
  readiness: ReadinessEntry[];
  mentors: MentorEntry[];
}) {
  const [sub, setSub] = useState<"readiness" | "mentor">("readiness");
  return (
    <div>
      <SubTabs
        tabs={[
          { key: "readiness", label: "準備度最高" },
          { key: "mentor", label: "帶出最多" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "readiness" ? (
        <div className="mt-2 space-y-1">
          {readiness.length === 0 ? (
            <EmptyState text="尚無準備度資料" />
          ) : (
            readiness.map((r, i) => {
              const colors = READINESS_LEVEL_COLORS[r.readinessLevel] ?? "";
              const levelLabel = READINESS_LEVEL_LABELS[r.readinessLevel] ?? r.readinessLevel;
              return (
                <Link
                  key={r.customerId}
                  href={`/dashboard/customers/${r.customerId}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-earth-50"
                >
                  <div className="flex items-center gap-2">
                    <RankBadge rank={i + 1} />
                    <span className="text-sm text-earth-800">{r.customerName}</span>
                    <StageBadge stage={r.talentStage} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>
                      {levelLabel}
                    </span>
                    <span className="text-xs font-medium text-earth-600">{r.score}分</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : (
        <RankList
          items={mentors.map((m) => ({
            id: m.customerId,
            name: m.name,
            value: m.partnerCount,
            unit: "位",
            stage: m.talentStage,
          }))}
          emptyText="尚無帶出紀錄"
        />
      )}
    </div>
  );
}

// ── Shared components ──

function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 border-b border-earth-100 pb-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`text-xs font-medium pb-1 transition-colors ${
            active === t.key
              ? "text-primary-600 border-b-2 border-primary-500"
              : "text-earth-400 hover:text-earth-600"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function RankList({
  items,
  emptyText,
}: {
  items: { id: string; name: string; value: number; unit: string; stage: string }[];
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="mt-2 space-y-1">
      {items.map((item, i) => (
        <Link
          key={item.id}
          href={`/dashboard/customers/${item.id}`}
          className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-earth-50"
        >
          <div className="flex items-center gap-2">
            <RankBadge rank={i + 1} />
            <span className="text-sm text-earth-800">{item.name}</span>
            <StageBadge stage={item.stage} />
          </div>
          <span className="text-xs font-bold text-earth-700">
            {item.value}
            <span className="ml-0.5 font-normal text-earth-400">{item.unit}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1
      ? "bg-amber-100 text-amber-700"
      : rank === 2
        ? "bg-gray-100 text-gray-600"
        : rank === 3
          ? "bg-orange-100 text-orange-600"
          : "bg-earth-100 text-earth-500";

  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${colors}`}>
      {rank}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const label = TALENT_STAGE_LABELS[stage as TalentStage] ?? stage;
  return (
    <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] text-earth-500">
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-xl bg-earth-50 py-6 text-center">
      <p className="text-sm text-earth-400">{text}</p>
    </div>
  );
}
