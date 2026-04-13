"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TalentStage } from "@prisma/client";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { UpgradeEligibility } from "@/types/talent";
import { StageUpdateDialog } from "../../talent/stage-update-dialog";
import { updateTalentStage } from "@/server/actions/talent";

const TALENT_STAGE_COLOR: Record<TalentStage, string> = {
  CUSTOMER: "bg-earth-100 text-earth-600",
  REGULAR: "bg-earth-200 text-earth-700",
  POTENTIAL_PARTNER: "bg-blue-100 text-blue-700",
  PARTNER: "bg-blue-200 text-blue-800",
  FUTURE_OWNER: "bg-amber-100 text-amber-700",
  OWNER: "bg-green-100 text-green-700",
};

interface Props {
  customerId: string;
  talentStage: TalentStage;
  sponsor: { id: string; name: string; phone: string } | null;
  referralCount: number;
  stageNote: string | null;
  isOwner: boolean;
  upgradeEligibility?: UpgradeEligibility | null;
}

export function TalentPipelineSection({
  customerId,
  talentStage,
  sponsor,
  referralCount,
  stageNote,
  isOwner,
  upgradeEligibility,
}: Props) {
  const [showDialog, setShowDialog] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpgrade = () => {
    startTransition(async () => {
      await updateTalentStage({
        customerId,
        newStage: "FUTURE_OWNER",
        note: "符合升級條件，由店長升為準店長",
      });
      setShowUpgradeConfirm(false);
      router.refresh();
    });
  };

  const elig = upgradeEligibility;

  return (
    <div className="mt-4 rounded-lg border border-earth-100 bg-earth-50/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-earth-500">人才管道</h3>
          {/* 升級狀態 badge */}
          {elig && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                elig.isEligibleForFutureOwner
                  ? "bg-green-100 text-green-700"
                  : "bg-earth-100 text-earth-500"
              }`}
            >
              {elig.isEligibleForFutureOwner ? "可升級" : "培養中"}
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            調整階段
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-earth-400">人才階段</dt>
          <dd className="mt-0.5">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TALENT_STAGE_COLOR[talentStage]}`}
            >
              {TALENT_STAGE_LABELS[talentStage]}
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-xs text-earth-400">推薦人</dt>
          <dd className="mt-0.5 text-sm font-medium text-earth-700">
            {sponsor ? (
              <Link
                href={`/dashboard/customers/${sponsor.id}`}
                className="text-primary-600 hover:text-primary-700"
              >
                {sponsor.name}
              </Link>
            ) : (
              <span className="text-earth-400">未設定</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-earth-400">推薦人數</dt>
          <dd className="mt-0.5 text-sm font-bold text-earth-700">
            {referralCount} 人
          </dd>
        </div>

        {stageNote && (
          <div>
            <dt className="text-xs text-earth-400">備註</dt>
            <dd className="mt-0.5 text-xs text-earth-600">{stageNote}</dd>
          </div>
        )}
      </div>

      {/* 升級進度條 — 僅 PARTNER 顯示 */}
      {elig && (
        <div className="mt-3 space-y-2 rounded-lg bg-white p-3">
          <h4 className="text-xs font-semibold text-earth-600">升級進度</h4>
          <div className="space-y-1.5">
            <ProgressRow
              label="準備度"
              met={elig.upgradeProgress.readiness.met}
              current={String(elig.upgradeProgress.readiness.current)}
              required={`${elig.upgradeProgress.readiness.required}+`}
            />
            <ProgressRow
              label="積分"
              met={elig.upgradeProgress.points.met}
              current={String(elig.upgradeProgress.points.current)}
              required={String(elig.upgradeProgress.points.required)}
              showBar
              pct={Math.min(
                (Number(elig.upgradeProgress.points.current) /
                  Number(elig.upgradeProgress.points.required)) *
                  100,
                100,
              )}
            />
            <ProgressRow
              label="轉介紹"
              met={elig.upgradeProgress.referrals.met}
              current={String(elig.upgradeProgress.referrals.current)}
              required={String(elig.upgradeProgress.referrals.required)}
              showBar
              pct={Math.min(
                (Number(elig.upgradeProgress.referrals.current) /
                  Number(elig.upgradeProgress.referrals.required)) *
                  100,
                100,
              )}
            />
          </div>

          {/* 升級建議 */}
          {elig.guidance.length > 0 && (
            <div className="mt-2 rounded bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] font-medium text-amber-700">升級建議</p>
              <ul className="mt-0.5 space-y-0.5">
                {elig.guidance.map((g, i) => (
                  <li key={i} className="text-xs text-amber-600">
                    • {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 升為準店長按鈕 */}
          {isOwner && elig.isEligibleForFutureOwner && (
            <div className="mt-2">
              {!showUpgradeConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowUpgradeConfirm(true)}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
                >
                  升為準店長
                </button>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-800">
                    確定要將此人升為「準店長」嗎？
                  </p>
                  <p className="mt-0.5 text-xs text-green-600">
                    將自動加 200 積分並建立階段變更紀錄
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpgrade}
                      disabled={isPending}
                      className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {isPending ? "處理中..." : "確認升級"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUpgradeConfirm(false)}
                      className="rounded-lg border border-earth-200 bg-white px-4 py-1.5 text-sm text-earth-600 hover:bg-earth-50"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showDialog && (
        <StageUpdateDialog
          customerId={customerId}
          customerName=""
          currentStage={talentStage}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}

function ProgressRow({
  label,
  met,
  current,
  required,
  showBar,
  pct,
}: {
  label: string;
  met: boolean;
  current: string;
  required: string;
  showBar?: boolean;
  pct?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
          met ? "bg-green-100 text-green-600" : "bg-earth-100 text-earth-400"
        }`}
      >
        {met ? "✓" : "·"}
      </span>
      <span className="w-12 text-xs text-earth-500">{label}</span>
      {showBar ? (
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-earth-100">
            <div
              className={`h-full rounded-full transition-all ${met ? "bg-green-500" : "bg-amber-400"}`}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <span className="text-[11px] text-earth-500">
            {current} / {required}
          </span>
        </div>
      ) : (
        <span className={`text-xs font-medium ${met ? "text-green-600" : "text-earth-500"}`}>
          {current}
          <span className="ml-1 text-earth-400">（需 {required}）</span>
        </span>
      )}
    </div>
  );
}
