import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";
import type {
  CustomerSourceSnapshot,
  DerivedCustomerSource,
} from "@/lib/customer-source";

/**
 * 身分診斷面板 — 給店長看「這位顧客究竟怎麼進來的」
 *
 * 為什麼需要這個面板：
 *   prod 觀察到多筆「來源 Email 註冊但 email=null」「來源 Email 但 LINE 已綁定」
 *   等矛盾資料，店長無法判斷是 bug、合併殘留、還是顧客真的沒走過 LINE。
 *   這裡把所有原始證據攤開，配合 deriveCustomerSource() 的判定一起呈現，
 *   不再讓店長只能猜 authSource。
 *
 * 顯示內容：
 *   - 真實註冊方式（derived label）
 *   - 來源異常 badge + 完整原因（紅色，整段不截）
 *   - 證據面板：Email / 手機 / 是否有密碼 / LINE 狀態 / OAuth providers /
 *     原始 authSource / Customer.lineUserId / Customer.googleId
 */

interface Props {
  derivedSource: DerivedCustomerSource;
  snapshot: CustomerSourceSnapshot;
  customerPhone: string;
}

const LINE_LINK_LABEL: Record<string, string> = {
  LINKED: "已綁定",
  UNLINKED: "未綁定",
  BLOCKED: "已封鎖",
};

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="text-earth-800">是</span>
  ) : (
    <span className="text-earth-400">否</span>
  );
}

export function IdentityDiagnosticPanel({
  derivedSource,
  snapshot,
  customerPhone,
}: Props) {
  const providers = snapshot.accountProviders;

  const items: InfoListItem[] = [
    {
      label: "註冊方式",
      value: (
        <span className="font-medium text-earth-900">{derivedSource.label}</span>
      ),
    },
    { label: "Email", value: snapshot.email },
    { label: "手機", value: customerPhone || "—" },
    {
      label: "可用密碼登入",
      value: <YesNo value={snapshot.hasPassword} />,
    },
    {
      label: "LINE 狀態",
      value: LINE_LINK_LABEL[snapshot.lineLinkStatus] ?? snapshot.lineLinkStatus,
    },
    {
      label: "OAuth Account",
      value:
        providers.length === 0 ? (
          <span className="text-earth-400">無</span>
        ) : (
          <span className="font-mono text-[11px] text-earth-700">
            {providers.join(", ")}
          </span>
        ),
    },
    {
      label: "DB authSource",
      value: (
        <span className="font-mono text-[11px] text-earth-500">
          {snapshot.authSource}
        </span>
      ),
    },
    {
      label: "Customer.lineUserId",
      value: snapshot.lineUserId ? (
        <span className="font-mono text-[11px] text-earth-700">
          {snapshot.lineUserId.slice(0, 10)}…
        </span>
      ) : (
        <span className="text-earth-400">—</span>
      ),
    },
    {
      label: "Customer.googleId",
      value: snapshot.googleId ? (
        <span className="font-mono text-[11px] text-earth-700">
          {snapshot.googleId.slice(0, 10)}…
        </span>
      ) : (
        <span className="text-earth-400">—</span>
      ),
    },
  ];

  return (
    <SideCard title="身分診斷" subtitle="真實註冊方式與證據">
      {derivedSource.inconsistent && derivedSource.inconsistencyReason && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
              來源異常
            </span>
            <span className="text-[11px] font-medium text-red-700">
              authSource 與證據不符
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-red-700">
            {derivedSource.inconsistencyReason}
          </p>
        </div>
      )}
      <InfoList items={items} density="compact" />
    </SideCard>
  );
}
