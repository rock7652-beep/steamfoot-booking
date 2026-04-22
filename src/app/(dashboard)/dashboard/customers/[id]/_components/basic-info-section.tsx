import { InfoList, type InfoListItem } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { LineBindingSection } from "../line-binding-section";
import { OpsPanel } from "../ops-panel";
import type { AuthSource, LineLinkStatus } from "@prisma/client";
import type { CustomerTag } from "@/server/queries/customer-tags";
import type { OpsActionLogEntry } from "@/server/actions/ops-action-log";

const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
  MANUAL: "店長手動建立",
  GOOGLE: "Google 註冊",
  LINE: "LINE 註冊",
  EMAIL: "Email 註冊",
};

const GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
};

interface Props {
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: Date | null;
  height: number | null;
  lineName: string | null;
  lineLinkStatus: LineLinkStatus;
  lineUserId: string | null;
  lineLinkedAt: Date | null;
  lineBindingCode: string | null;
  lineBindingCodeCreatedAt: Date | null;
  authSource: AuthSource;
  createdAt: Date;
  assignedStaff: { id: string; displayName: string; colorCode: string } | null;
  notes: string | null;
  /** Ops panel (role-gated above) */
  showOpsPanel: boolean;
  opsTags: CustomerTag[];
  opsScripts: string[];
  opsFollowUp: OpsActionLogEntry | null;
}

function SubHeader({ label }: { label: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
      {label}
    </h3>
  );
}

export function BasicInfoSection({
  customerId,
  name,
  phone,
  email,
  gender,
  birthday,
  height,
  lineName,
  lineLinkStatus,
  lineUserId,
  lineLinkedAt,
  lineBindingCode,
  lineBindingCodeCreatedAt,
  authSource,
  createdAt,
  assignedStaff,
  notes,
  showOpsPanel,
  opsTags,
  opsScripts,
  opsFollowUp,
}: Props) {
  const items: InfoListItem[] = [
    { label: "電話", value: phone || "—" },
    { label: "Email", value: email },
    {
      label: "LINE 名稱",
      value: lineName ? (
        <span className="inline-flex items-center gap-1">
          <span>{lineName}</span>
          {lineLinkStatus === "LINKED" ? (
            <span className="rounded bg-green-50 px-1 py-0.5 text-[10px] font-medium text-green-700">
              已綁定
            </span>
          ) : (
            <span className="text-[10px] text-earth-400">未綁定</span>
          )}
        </span>
      ) : null,
    },
    { label: "性別", value: gender ? (GENDER_LABEL[gender] ?? gender) : null },
    {
      label: "生日",
      value: birthday ? formatTWTime(birthday, { dateOnly: true }) : null,
    },
    { label: "身高", value: height ? `${height} cm` : null },
    {
      label: "直屬店長",
      value: assignedStaff ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: assignedStaff.colorCode }}
          />
          <span>{assignedStaff.displayName}</span>
        </span>
      ) : (
        <span className="text-earth-400">未指派</span>
      ),
    },
    { label: "來源", value: AUTH_SOURCE_LABEL[authSource] },
    {
      label: "建立時間",
      value: formatTWTime(createdAt, { dateOnly: true }),
    },
    ...(notes ? [{ label: "備註", value: notes, full: true } as InfoListItem] : []),
  ];

  return (
    <section className="rounded-[20px] border border-earth-200 bg-white">
      <header className="border-b border-earth-100 px-6 py-4">
        <h2 className="text-base font-semibold text-earth-900">基本資料</h2>
        <p className="text-[12px] text-earth-400">核心檔案 · LINE 綁定 · 標籤與跟進</p>
      </header>

      <div className="space-y-5 px-6 py-5">
        {/* 基本資料 */}
        <div>
          <SubHeader label="核心檔案" />
          <div className="mt-2">
            <InfoList items={items} columns={2} />
          </div>
        </div>

        {/* LINE 綁定 */}
        <div id="line-binding" className="scroll-mt-16">
          <SubHeader label="LINE 綁定設定" />
          <div className="mt-2">
            <LineBindingSection
              customerId={customerId}
              lineLinkStatus={lineLinkStatus}
              lineUserId={lineUserId}
              lineLinkedAt={lineLinkedAt?.toISOString() ?? null}
              lineBindingCode={lineBindingCode}
              lineBindingCodeCreatedAt={lineBindingCodeCreatedAt?.toISOString() ?? null}
            />
          </div>
        </div>

        {/* 標籤與跟進 (Ops Panel) */}
        {showOpsPanel && (
          <div>
            <SubHeader label="標籤與跟進" />
            <div className="mt-2">
              <OpsPanel
                customerId={customerId}
                customerName={name}
                phone={phone}
                lineLinked={lineLinkStatus === "LINKED" && !!lineUserId}
                tags={opsTags}
                scripts={opsScripts}
                followUp={opsFollowUp}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
