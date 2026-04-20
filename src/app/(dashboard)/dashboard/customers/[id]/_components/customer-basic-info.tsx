import { formatTWTime } from "@/lib/date-utils";
import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";
import type { AuthSource, LineLinkStatus } from "@prisma/client";

/**
 * 顧客詳情 — 基本資料 section (左側 col-8)
 *
 * 資訊面板樣式；無資料一律顯示 `—`，不省略行。
 */

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
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: Date | null;
  height: number | null;
  lineName: string | null;
  lineLinkStatus: LineLinkStatus;
  authSource: AuthSource;
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
  authSource,
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
    { label: "來源", value: AUTH_SOURCE_LABEL[authSource] },
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
