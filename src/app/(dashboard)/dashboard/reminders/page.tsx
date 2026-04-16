import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  listReminderRules,
  listMessageTemplates,
  listMessageLogs,
  getReminderStats,
} from "@/server/queries/reminder";
import { RuleToggle } from "./rule-toggle";
import { CreateRuleForm } from "./create-rule-form";
import { CreateTemplateForm } from "./create-template-form";

const LOG_STATUS_LABEL: Record<string, string> = {
  PENDING: "待發送",
  SENT: "已發送",
  FAILED: "失敗",
  SKIPPED: "已跳過",
};

const LOG_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-earth-100 text-earth-500",
};

function formatTriggerLabel(rule: {
  type: string;
  triggerType: string;
  offsetMinutes: number | null;
  offsetDays: number;
  fixedTime: string | null;
}): string {
  if (rule.type === "relative" && rule.offsetMinutes) {
    const hours = rule.offsetMinutes / 60;
    return hours >= 1
      ? `預約前 ${hours % 1 === 0 ? hours : hours.toFixed(1)} 小時`
      : `預約前 ${rule.offsetMinutes} 分鐘`;
  }
  if (rule.type === "fixed") {
    const days = rule.offsetDays === 0 ? "當天" : `前 ${rule.offsetDays} 天`;
    return `${days} ${rule.fixedTime ?? "20:00"} 發送`;
  }
  // Legacy fallback
  const LEGACY: Record<string, string> = {
    BEFORE_BOOKING_1D: "預約前一天",
    BEFORE_BOOKING_2H: "預約前 2 小時",
  };
  return LEGACY[rule.triggerType] ?? rule.triggerType;
}

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string; search?: string; page?: string }>;
}

export default async function RemindersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const plan = await getCurrentStorePlan();
  const activeTab = params.tab ?? "rules";
  const activeStoreId = await getActiveStoreForRead(user);

  const [stats, rules, templates] = await Promise.all([
    getReminderStats(activeStoreId),
    listReminderRules(),
    listMessageTemplates(),
  ]);

  // Only fetch logs if on logs tab
  const logsData = activeTab === "logs"
    ? await listMessageLogs({
        status: params.status,
        search: params.search,
        page: Number(params.page ?? 1),
        activeStoreId,
      })
    : { logs: [], total: 0, pageSize: 30 };

  return (
    <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER}>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-earth-900">提醒管理</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "啟用中規則", value: stats.enabledRules, color: "text-primary-700" },
          { label: "今日待發送", value: stats.todayPending, color: "text-yellow-700" },
          { label: "今日已發送", value: stats.todaySent, color: "text-green-700" },
          { label: "發送失敗", value: stats.todayFailed, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-earth-200 bg-white p-4">
            <p className="text-xs text-earth-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-earth-200">
        {[
          { key: "rules", label: "提醒規則" },
          { key: "templates", label: "訊息模板" },
          { key: "logs", label: "發送紀錄" },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={`/dashboard/reminders?tab=${tab.key}`}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-primary-600 text-primary-700"
                : "text-earth-500 hover:text-earth-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <CreateRuleForm templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
          </div>
          {rules.length === 0 ? (
            <div className="rounded-xl border border-earth-200 bg-white p-8 text-center text-sm text-earth-400">
              尚未建立提醒規則
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-earth-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-earth-800">{rule.name}</h3>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${
                          rule.isEnabled ? "bg-green-100 text-green-700" : "bg-earth-100 text-earth-500"
                        }`}>
                          {rule.isEnabled ? "啟用" : "停用"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-earth-500">
                        觸發條件：{formatTriggerLabel(rule)}
                        {" · "}通路：{rule.channel}
                        {rule.template && <>{" · "}模板：{rule.template.name}</>}
                      </p>
                    </div>
                    <RuleToggle ruleId={rule.id} isEnabled={rule.isEnabled} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <CreateTemplateForm />
          </div>
          {templates.length === 0 ? (
            <div className="rounded-xl border border-earth-200 bg-white p-8 text-center text-sm text-earth-400">
              尚未建立訊息模板
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-earth-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-earth-800">{t.name}</h3>
                    {t.isDefault && (
                      <span className="rounded bg-primary-100 px-1.5 py-0.5 text-xs text-primary-700">預設</span>
                    )}
                    <span className="rounded bg-earth-100 px-1.5 py-0.5 text-xs text-earth-500">{t.channel}</span>
                  </div>
                  {/* Phone preview */}
                  <div className="mt-3 rounded-lg bg-earth-50 p-3">
                    <div className="mx-auto max-w-[240px] rounded-2xl bg-white p-3 shadow-sm">
                      <div className="mb-1 text-[10px] text-earth-400">LINE 預覽</div>
                      <div className="rounded-lg bg-[#06C755]/10 p-2.5 text-xs leading-relaxed text-earth-700">
                        {t.body.split("\n").map((line, i) => (
                          <span key={i}>
                            {line}
                            {i < t.body.split("\n").length - 1 && <br />}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-earth-400">
                    <span>使用中規則: {t._count.rules}</span>
                    <span>發送次數: {t._count.logs}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <div className="space-y-4">
          {/* Filters */}
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="logs" />
            <input
              name="search"
              placeholder="搜尋顧客姓名"
              defaultValue={params.search ?? ""}
              className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm"
            />
            <select
              name="status"
              defaultValue={params.status ?? "ALL"}
              className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm"
            >
              <option value="ALL">全部狀態</option>
              <option value="SENT">已發送</option>
              <option value="FAILED">失敗</option>
              <option value="PENDING">待發送</option>
              <option value="SKIPPED">已跳過</option>
            </select>
            <button type="submit" className="rounded-lg bg-earth-100 px-3 py-1.5 text-sm hover:bg-earth-200">
              篩選
            </button>
          </form>

          {/* Logs table */}
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-100 bg-earth-50">
                  <th className="px-4 py-3 text-left font-medium text-earth-600">發送時間</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">顧客</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">規則</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">通路</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">狀態</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">失敗原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {logsData.logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-earth-400">
                      尚無發送紀錄
                    </td>
                  </tr>
                ) : (
                  logsData.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-earth-600">
                        {log.sentAt
                          ? new Date(log.sentAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
                          : new Date(log.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/customers/${log.customer.id}`} className="text-primary-600 hover:underline">
                          {log.customer.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-earth-600">{log.rule?.name ?? "手動發送"}</td>
                      <td className="px-4 py-3 text-earth-600">{log.channel}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${LOG_STATUS_COLOR[log.status] ?? ""}`}>
                          {LOG_STATUS_LABEL[log.status] ?? log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-red-500">
                        {log.errorMessage ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logsData.total > logsData.pageSize && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: Math.ceil(logsData.total / logsData.pageSize) }, (_, i) => (
                <Link
                  key={i}
                  href={`/dashboard/reminders?tab=logs&page=${i + 1}${params.status ? `&status=${params.status}` : ""}${params.search ? `&search=${params.search}` : ""}`}
                  className={`rounded px-3 py-1 text-sm ${
                    Number(params.page ?? 1) === i + 1 ? "bg-primary-600 text-white" : "bg-earth-100 text-earth-600"
                  }`}
                >
                  {i + 1}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </FeatureGate>
  );
}
