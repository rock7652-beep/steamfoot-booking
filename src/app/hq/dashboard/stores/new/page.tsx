"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createStoreAction } from "@/server/actions/store-onboarding";
import type { CreateStoreInput, StoreDeliverySummary } from "@/types/store-onboarding";

export default function NewStorePage() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoreDeliverySummary | null>(null);

  // Form state — Store
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<"EXPERIENCE" | "BASIC" | "GROWTH" | "ALLIANCE">("GROWTH");
  const [shopPlan, setShopPlan] = useState<"FREE" | "BASIC" | "PRO">("PRO");
  const [isDemo, setIsDemo] = useState(false);
  const [domain, setDomain] = useState("");
  const [lineDestination, setLineDestination] = useState("");
  const [dutySchedulingEnabled, setDutySchedulingEnabled] = useState(false);

  // Form state — Owner
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  function handleSubmit() {
    setError(null);

    const input: CreateStoreInput = {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      plan,
      shopPlan,
      isDemo,
      domain: domain.trim() || undefined,
      lineDestination: lineDestination.trim() || undefined,
      dutySchedulingEnabled: dutySchedulingEnabled || undefined,
      owner: {
        name: ownerName.trim(),
        email: ownerEmail.trim(),
        password: ownerPassword,
      },
    };

    startTransition(async () => {
      const res = await createStoreAction(input);
      if (res.success) {
        setResult(res.data);
      } else {
        setError(res.error);
      }
    });
  }

  // ── 建店成功 → 顯示交付摘要 ──
  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-green-700">建店完成</h1>
          <p className="mt-1 text-sm text-earth-500">以下為交付摘要，請保存或轉發給店家</p>
        </div>

        <div className="space-y-6">
          {/* Store info */}
          <Section title="店舖資訊">
            <InfoRow label="店名" value={result.store.name} />
            <InfoRow label="Slug" value={result.store.slug} mono />
            <InfoRow label="Store ID" value={result.store.id} mono />
            <InfoRow label="方案" value={result.store.plan} />
            <InfoRow label="狀態" value={result.store.planStatus} />
            <InfoRow label="類型" value={result.store.isDemo ? "Demo" : "正式"} />
          </Section>

          {/* URLs — 前台 */}
          <Section title="前台網址">
            <InfoRow label="顧客登入" value={result.urls.storefront} link />
            <InfoRow label="預約頁" value={result.urls.booking} link />
            <InfoRow label="註冊頁" value={result.urls.register} link />
          </Section>

          {/* URLs — 後台 */}
          <Section title="後台網址">
            <InfoRow label="後台登入" value={result.urls.adminLogin} link />
            <InfoRow label="店舖後台" value={result.urls.adminDashboard} link />
            <InfoRow label="HQ 管理" value={result.urls.hqStoreDetail} link />
          </Section>

          {/* Accounts */}
          <Section title="帳號">
            <InfoRow label="OWNER" value={`${result.accounts.owner.name} (${result.accounts.owner.email})`} />
            {result.accounts.staff.map((s, i) => (
              <InfoRow key={i} label={`STAFF ${i + 1}`} value={`${s.name} (${s.email}) — ${s.role}`} />
            ))}
          </Section>

          {/* Third-party */}
          <Section title="第三方服務">
            <InfoRow label="LINE" value={result.thirdParty.line === "configured" ? "已設定" : "未設定"} />
            <InfoRow label="Email 服務" value={result.thirdParty.email === "configured" ? "已設定" : "未設定"} />
          </Section>

          {/* Checklist */}
          <Section title="驗收 Checklist">
            {result.checklist.map((item) => (
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

          {/* Activation */}
          <div className={`rounded-lg border px-4 py-3 ${result.canActivate ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-medium ${result.canActivate ? "text-green-700" : "text-amber-700"}`}>
              {result.store.isDemo
                ? "ℹ️ Demo 店不可啟用為正式店"
                : result.canActivate
                  ? "✅ 可正式啟用（TRIAL → ACTIVE）"
                  : "⚠️ 部分項目未通過，建議先修正"}
            </p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Link
            href={`/hq/dashboard/stores/${result.store.id}`}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            查看店舖詳情
          </Link>
          <Link
            href="/hq/dashboard/stores"
            className="rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50"
          >
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  // ── 建店表單 ──
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-earth-900">建立新店</h1>
        <p className="mt-1 text-sm text-earth-500">填寫店舖基本資料與 OWNER 帳號</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="space-y-8 rounded-xl border border-earth-200 bg-white p-6">
        {/* 店舖資訊 */}
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-earth-800">店舖資訊</legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="店名 *" value={name} onChange={setName} placeholder="蒸足 XX店" />
            <Field label="Slug *" value={slug} onChange={setSlug} placeholder="kaohsiung" hint="小寫英數字 + 短橫線" />
            <SelectField label="PricingPlan" value={plan} onChange={setPlan as (v: string) => void}
              options={[
                { value: "EXPERIENCE", label: "EXPERIENCE" },
                { value: "BASIC", label: "BASIC" },
                { value: "GROWTH", label: "GROWTH" },
                { value: "ALLIANCE", label: "ALLIANCE" },
              ]}
            />
            <SelectField label="ShopPlan" value={shopPlan} onChange={setShopPlan as (v: string) => void}
              options={[
                { value: "FREE", label: "FREE（試用）" },
                { value: "BASIC", label: "BASIC" },
                { value: "PRO", label: "PRO" },
              ]}
            />
            <Field label="自訂網域" value={domain} onChange={setDomain} placeholder="steamfoot-xx.com" />
            <Field label="LINE Destination" value={lineDestination} onChange={setLineDestination} placeholder="Uxxxxxxx" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-earth-700">
              <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} className="rounded" />
              這是 Demo 店（僅供展示或測試）
            </label>
            <label className="flex items-center gap-2 text-sm text-earth-700">
              <input type="checkbox" checked={dutySchedulingEnabled} onChange={(e) => setDutySchedulingEnabled(e.target.checked)} className="rounded" />
              啟用值班排程功能
            </label>
          </div>
        </fieldset>

        {/* OWNER */}
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-earth-800">OWNER 帳號</legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="姓名 *" value={ownerName} onChange={setOwnerName} placeholder="王小明" />
            <Field label="Email *" value={ownerEmail} onChange={setOwnerEmail} type="email" placeholder="owner@store.com" />
            <Field label="密碼 *" value={ownerPassword} onChange={setOwnerPassword} type="password" placeholder="至少 6 字元" />
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "建立中..." : "建立店舖"}
        </button>
      </div>

      <div className="mt-4 text-center">
        <Link href="/hq/dashboard/stores" className="text-sm text-earth-500 hover:text-earth-700">
          ← 返回店舖列表
        </Link>
      </div>
    </div>
  );
}

// ── Helper components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-earth-800">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-24 shrink-0 text-earth-500">{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{value}</a>
      ) : (
        <span className={`text-earth-800 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-earth-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      {hint && <p className="mt-0.5 text-[11px] text-earth-400">{hint}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-earth-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
