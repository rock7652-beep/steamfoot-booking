import { formatTWTime } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";
import type {
  AuthSource,
  CustomerStage,
  LineLinkStatus,
  TalentStage,
} from "@prisma/client";
import { EditCustomerModal } from "../edit-customer-modal";

/**
 * 顧客詳情右側 Action Rail (col-4)
 *
 * 三塊：
 *   A. 狀態 badges（顧客階段 / LINE / 人才階段 / 高潛力）
 *   B. 快速操作（編輯 / 新增預約 / 查看預約 / 查看推薦 / 調整階段）
 *   C. 系統資訊（建立 / 更新 / ID 縮寫 / 綁定日期 / 來源）
 */

const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
  MANUAL: "店長手動",
  GOOGLE: "Google",
  LINE: "LINE",
  EMAIL: "Email",
};

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

interface EditTarget {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  height: number | null;
  notes: string | null;
  lineName: string | null;
}

interface Props {
  customerId: string;
  customerStage: CustomerStage;
  talentStage: TalentStage;
  lineLinkStatus: LineLinkStatus;
  lineLinkedAt: Date | null;
  selfBookingEnabled: boolean;
  accountActive: boolean;
  isHighPotential: boolean;
  authSource: AuthSource;
  createdAt: Date;
  updatedAt: Date;
  editTarget: EditTarget;
  /** 是否可操作 write 動作（某些角色僅能讀） */
  canEdit: boolean;
}

export function CustomerActionRail({
  customerId,
  customerStage,
  talentStage,
  lineLinkStatus,
  lineLinkedAt,
  selfBookingEnabled,
  accountActive,
  isHighPotential,
  authSource,
  createdAt,
  updatedAt,
  editTarget,
  canEdit,
}: Props) {
  const systemItems: InfoListItem[] = [
    { label: "ID", value: <span className="font-mono text-[11px]">{customerId.slice(-8)}</span> },
    { label: "建立", value: formatTWTime(createdAt, { dateOnly: true }) },
    { label: "最後更新", value: formatTWTime(updatedAt, { dateOnly: true }) },
    {
      label: "LINE 綁定",
      value: lineLinkedAt ? formatTWTime(lineLinkedAt, { dateOnly: true }) : null,
    },
    { label: "來源", value: AUTH_SOURCE_LABEL[authSource] },
  ];

  const actionBase =
    "flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50";

  return (
    <aside className="col-span-12 space-y-3 lg:col-span-4">
      {/* A. 狀態卡 */}
      <SideCard title="狀態" subtitle="目前系統判斷">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CUSTOMER_STAGE_COLOR[customerStage]}`}
          >
            {CUSTOMER_STAGE_LABEL[customerStage]}
          </span>
          {lineLinkStatus === "LINKED" ? (
            <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
              LINE 已綁定
            </span>
          ) : (
            <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[11px] font-medium text-earth-500">
              LINE 未綁定
            </span>
          )}
          {accountActive ? (
            <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">
              帳號已啟用
            </span>
          ) : (
            <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">
              帳號未開通
            </span>
          )}
          {selfBookingEnabled ? (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
              自助預約
            </span>
          ) : null}
          {isHighPotential ? (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              高潛力
            </span>
          ) : null}
          <span className="rounded bg-earth-50 px-1.5 py-0.5 text-[11px] font-medium text-earth-600">
            {talentStage}
          </span>
        </div>
      </SideCard>

      {/* B. 快速操作 */}
      <SideCard title="快速操作" subtitle="常用動作直接進入">
        <div className="flex flex-col gap-1.5">
          {canEdit ? (
            <EditCustomerModal customer={editTarget} />
          ) : (
            <span className={`${actionBase} cursor-not-allowed opacity-50`}>
              <span>編輯資料</span>
              <span>→</span>
            </span>
          )}
          <Link href={`#booking`} className={actionBase}>
            <span>新增預約</span>
            <span>→</span>
          </Link>
          <Link href={`#bookings-history`} className={actionBase}>
            <span>查看預約紀錄</span>
            <span>→</span>
          </Link>
          <Link href={`#referrals`} className={actionBase}>
            <span>查看推薦</span>
            <span>→</span>
          </Link>
          <Link href={`#stage`} className={actionBase}>
            <span>調整階段</span>
            <span>→</span>
          </Link>
        </div>
      </SideCard>

      {/* C. 系統資訊 */}
      <SideCard title="系統資訊" subtitle="營運除錯用">
        <InfoList items={systemItems} density="compact" />
      </SideCard>
    </aside>
  );
}
