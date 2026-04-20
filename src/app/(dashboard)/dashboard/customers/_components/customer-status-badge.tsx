import type { CustomerStage, LineLinkStatus } from "@prisma/client";

/**
 * 顧客列表狀態 badge — 小色塊 + 可選 LINE 綁定小標。
 *
 * Phase 2 桌機版重構用；沿用 earth/primary token。
 */

const STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const STAGE_COLOR: Record<CustomerStage, string> = {
  LEAD: "bg-earth-100 text-earth-700",
  TRIAL: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-primary-100 text-primary-700",
  INACTIVE: "bg-yellow-50 text-yellow-700",
};

interface Props {
  stage: CustomerStage;
  lineLinkStatus?: LineLinkStatus;
}

export function CustomerStatusBadge({ stage, lineLinkStatus }: Props) {
  const linked = lineLinkStatus === "LINKED";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STAGE_COLOR[stage]}`}>
        {STAGE_LABEL[stage]}
      </span>
      {linked ? (
        <span
          className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
          title="LINE 已綁定"
        >
          LINE
        </span>
      ) : null}
    </span>
  );
}
