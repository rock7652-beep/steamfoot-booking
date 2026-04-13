"use client";

import { useState } from "react";
import Link from "next/link";
import type { TalentStage } from "@prisma/client";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import { StageUpdateDialog } from "../../talent/stage-update-dialog";

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
}

export function TalentPipelineSection({
  customerId,
  talentStage,
  sponsor,
  referralCount,
  stageNote,
  isOwner,
}: Props) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-earth-100 bg-earth-50/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-earth-500">人才管道</h3>
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
