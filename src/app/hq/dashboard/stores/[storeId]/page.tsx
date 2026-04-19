import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import { getStoreDeliverySummary, activateStoreAction } from "@/server/actions/store-onboarding";

interface PageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreDetailPage({ params }: PageProps) {
  const { storeId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const result = await getStoreDeliverySummary(storeId);
  if (!result.success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-600">{result.error}</p>
        <Link href="/hq/dashboard/stores" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
          ← 返回列表
        </Link>
      </div>
    );
  }

  const summary = result.data;
  const canShowActivate = !summary.store.isDemo && summary.store.planStatus !== "ACTIVE" && summary.canActivate;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-earth-900">{summary.store.name}</h1>
          <p className="mt-1 text-sm text-earth-500">
            <span className="font-mono">{summary.store.slug}</span> · {summary.store.plan} ·{" "}
            <span className={summary.store.planStatus === "ACTIVE" ? "text-green-600" : "text-amber-600"}>
              {summary.store.planStatus}
            </span>
            {summary.store.isDemo && <span className="ml-2 text-amber-600">(Demo)</span>}
          </p>
        </div>
        {canShowActivate && (
          <ActivateButton storeId={storeId} />
        )}
      </div>

      <div className="space-y-6">
        {/* URLs — 前台 */}
        <Section title="前台網址">
          <InfoRow label="顧客登入" value={summary.urls.storefront} link />
          <InfoRow label="預約頁" value={summary.urls.booking} link />
          <InfoRow label="註冊頁" value={summary.urls.register} link />
        </Section>

        {/* URLs — 後台 */}
        <Section title="後台網址">
          <InfoRow label="後台登入" value={summary.urls.adminLogin} link />
          <InfoRow label="店舖後台" value={summary.urls.adminDashboard} link />
          <InfoRow label="HQ 管理" value={summary.urls.hqStoreDetail} link />
        </Section>

        {/* Accounts */}
        <Section title="帳號">
          <InfoRow label="OWNER" value={`${summary.accounts.owner.name} (${summary.accounts.owner.email})`} />
          {summary.accounts.staff.map((s, i) => (
            <InfoRow key={i} label={`STAFF ${i + 1}`} value={`${s.name} (${s.email}) — ${s.role}`} />
          ))}
        </Section>

        {/* Third-party */}
        <Section title="第三方服務">
          <InfoRow label="LINE" value={summary.thirdParty.line === "configured" ? "已設定" : "未設定"} />
          <InfoRow label="Email 服務" value={summary.thirdParty.email === "configured" ? "已設定" : "未設定"} />
        </Section>

        {/* Checklist */}
        <Section title="驗收 Checklist">
          {summary.checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-2 py-1">
              <span className={`text-sm ${
                item.status === "pass" ? "text-green-600" :
                item.status === "fail" ? "text-red-600" : "text-amber-500"
              }`}>
                {item.status === "pass" ? "✅" : item.status === "fail" ? "❌" : "⏭️"}
              </span>
              <span className="text-sm text-earth-700">{item.label}</span>
            </div>
          ))}
        </Section>

        {/* Status bar */}
        {summary.store.isDemo ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-medium text-blue-700">
              ℹ️ Demo 店不可啟用為正式店
            </p>
          </div>
        ) : (
          <div className={`rounded-lg border px-4 py-3 ${summary.canActivate ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-medium ${summary.canActivate ? "text-green-700" : "text-amber-700"}`}>
              {summary.store.planStatus === "ACTIVE"
                ? "✅ 已正式啟用"
                : summary.canActivate
                  ? "✅ 可正式啟用（TRIAL → ACTIVE）"
                  : "⚠️ 部分項目未通過，建議先修正"}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <Link href="/hq/dashboard/stores" className="text-sm text-earth-500 hover:text-earth-700">
          ← 返回店舖列表
        </Link>
      </div>
    </div>
  );
}

// ── Activate Button (Client Component) ──
function ActivateButton({ storeId }: { storeId: string }) {
  return (
    <form action={async () => {
      "use server";
      await activateStoreAction(storeId);
      const { revalidatePath } = await import("next/cache");
      revalidatePath(`/hq/dashboard/stores/${storeId}`);
    }}>
      <button
        type="submit"
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        啟用店舖
      </button>
    </form>
  );
}

// ── Helpers ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-earth-800">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-24 shrink-0 text-earth-500">{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{value}</a>
      ) : (
        <span className="text-earth-800 break-all">{value}</span>
      )}
    </div>
  );
}
