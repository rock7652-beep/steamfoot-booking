import { formatTWTime } from "@/lib/date-utils";
import { TransferCustomerForm } from "../transfer-customer-form";
import type { AuthSource } from "@prisma/client";

/**
 * 右側 Sidebar S6 — 系統資訊 + 管理動作
 */

const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
  MANUAL: "店長手動",
  GOOGLE: "Google",
  LINE: "LINE",
  EMAIL: "Email",
};

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
  authSource: AuthSource;
  staffList: StaffOption[];
  currentStaffId: string | null;
  isAdmin: boolean;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12px]">
      <span className="text-earth-500">{label}</span>
      <span className="text-earth-800">{value}</span>
    </div>
  );
}

export function SidebarSystemInfo({
  customerId,
  createdAt,
  updatedAt,
  authSource,
  staffList,
  currentStaffId,
  isAdmin,
}: Props) {
  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <h3 className="text-[13px] font-semibold text-earth-800">系統資訊</h3>

      <div className="mt-2 divide-y divide-earth-100">
        <Row label="ID" value={<span className="font-mono">{customerId.slice(-8)}</span>} />
        <Row label="建立" value={formatTWTime(createdAt, { dateOnly: true })} />
        <Row label="更新" value={formatTWTime(updatedAt, { dateOnly: true })} />
        <Row label="來源" value={AUTH_SOURCE_LABEL[authSource]} />
      </div>

      {isAdmin && staffList.length > 0 && (
        <div className="mt-3 border-t border-earth-100 pt-3">
          <p className="mb-1 text-[10px] text-earth-400">管理動作</p>
          <TransferCustomerForm
            customerId={customerId}
            currentStaffId={currentStaffId}
            staffList={staffList}
          />
        </div>
      )}
    </section>
  );
}
