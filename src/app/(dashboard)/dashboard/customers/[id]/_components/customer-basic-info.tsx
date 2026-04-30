import { formatTWTime } from "@/lib/date-utils";
import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";
import type { LineLinkStatus } from "@prisma/client";
import type { DerivedCustomerSource } from "@/lib/customer-source";

/**
 * 顧客詳情 — 基本資料 section (左側 col-8)
 *
 * 資訊面板樣式；無資料一律顯示 `—`，不省略行。
 *
 * 「來源」改用 deriveCustomerSource() 推導 — 不直接信 Customer.authSource，
 * 因為實務上 authSource 會與證據不一致（/register 硬寫 EMAIL、合併殘留⋯）。
 */

const GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
};

interface Props {
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: Date | null;
  height: number | null;
  lineName: string | null;
  lineLinkStatus: LineLinkStatus;
  derivedSource: DerivedCustomerSource;
  createdAt: Date;
  assignedStaff: { id: string; displayName: string; colorCode: string } | null;
  notes: string | null;
}

export function CustomerBasicInfo({
  phone,
  email,
  gender,
  birthday,
  height,
  lineName,
  lineLinkStatus,
  derivedSource,
  createdAt,
  assignedStaff,
  notes,
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
    {
      label: "來源",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span>{derivedSource.label}</span>
          {derivedSource.inconsistent && (
            <span
              className="cursor-help rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
              title={derivedSource.inconsistencyReason ?? "來源欄位與資料證據不符"}
            >
              來源異常
            </span>
          )}
        </span>
      ),
    },
    {
      label: "建立時間",
      value: formatTWTime(createdAt, { dateOnly: true }),
    },
    ...(notes
      ? [{ label: "備註", value: notes, full: true } as InfoListItem]
      : []),
  ];

  return (
    <SideCard title="基本資料" subtitle="顧客核心檔案" flush>
      <div className="px-3 py-2">
        <InfoList items={items} columns={2} />
      </div>
    </SideCard>
  );
}
