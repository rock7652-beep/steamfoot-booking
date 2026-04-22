import type { CustomerStage, TalentStage, AuthSource, LineLinkStatus } from "@prisma/client";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerTag } from "@/server/queries/customer-tags";

/**
 * 右側 Sidebar S2 — 顧客摘要卡（補強資訊版）
 *
 * 跟頂部 CustomerHeaderCard 分工：
 *   Header（左上）= 姓名 / 電話 / 抬頭 KPI（最近來店 / 累積來店 / 剩餘堂數 / 推薦 / 人才階段）
 *   Sidebar Summary（右側）= 狀態 badges、直屬店長、來源、系統標籤 — 不重複 name/phone/KPI
 */

const CUSTOMER_STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const CUSTOMER_STAGE_COLOR: Record<CustomerStage, string> = {
  LEAD: "bg-earth-100 text-earth-700",
  TRIAL: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-primary-100 text-primary-700",
  INACTIVE: "bg-yellow-50 text-yellow-700",
};

const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
  MANUAL: "手動建立",
  GOOGLE: "Google",
  LINE: "LINE",
  EMAIL: "Email",
};

interface Props {
  lineLinkStatus: LineLinkStatus;
  assignedStaff: { id: string; displayName: string; colorCode: string } | null;
  customerStage: CustomerStage;
  talentStage: TalentStage;
  tags: CustomerTag[];
  authSource: AuthSource;
}

export function SidebarSummaryCard({
  lineLinkStatus,
  assignedStaff,
  customerStage,
  talentStage,
  tags,
  authSource,
}: Props) {
  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <h3 className="text-[13px] font-semibold text-earth-800">顧客摘要</h3>
      <p className="text-[11px] text-earth-400">狀態、直屬、標籤</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CUSTOMER_STAGE_COLOR[customerStage]}`}
        >
          {CUSTOMER_STAGE_LABEL[customerStage]}
        </span>
        {lineLinkStatus === "LINKED" ? (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
            LINE 已綁定
          </span>
        ) : (
          <span className="rounded-full bg-earth-100 px-2 py-0.5 text-[11px] font-medium text-earth-500">
            LINE 未綁定
          </span>
        )}
        <span className="rounded-full bg-earth-50 px-2 py-0.5 text-[11px] font-medium text-earth-600">
          {TALENT_STAGE_LABELS[talentStage]}
        </span>
      </div>

      <div className="mt-4 space-y-1 border-t border-earth-100 pt-3 text-[12px]">
        {assignedStaff ? (
          <div className="flex items-center justify-between">
            <span className="text-earth-500">直屬店長</span>
            <span className="inline-flex items-center gap-1.5 text-earth-800">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: assignedStaff.colorCode }}
              />
              <span>{assignedStaff.displayName}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-earth-500">直屬店長</span>
            <span className="text-earth-400">未指派</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-earth-500">來源</span>
          <span className="text-earth-800">{AUTH_SOURCE_LABEL[authSource]}</span>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mt-3 border-t border-earth-100 pt-3">
          <p className="mb-1 text-[10px] text-earth-400">系統標籤</p>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tag.color} ${tag.textColor}`}
                title={tag.description}
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
