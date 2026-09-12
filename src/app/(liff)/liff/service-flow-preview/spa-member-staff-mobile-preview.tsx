"use client";

import { useState } from "react";

type PreviewScreen = "booking" | "appointments" | "work" | "detail";

const screens: Array<{ id: PreviewScreen; label: string }> = [
  { id: "booking", label: "會員預約" },
  { id: "appointments", label: "我的預約" },
  { id: "work", label: "我的工作" },
  { id: "detail", label: "工作詳情" },
];

const weekDays = [
  { weekday: "一", date: "14", count: 1 },
  { weekday: "二", date: "15", count: 0 },
  { weekday: "三", date: "16", count: 3, active: true },
  { weekday: "四", date: "17", count: 2 },
  { weekday: "五", date: "18", count: 1 },
  { weekday: "六", date: "19", count: 4 },
  { weekday: "日", date: "20", count: 0 },
];

export function SpaMemberStaffMobilePreview({
  storeName,
  mapUrl,
}: {
  storeName: string;
  mapUrl: string;
}) {
  const [screen, setScreen] = useState<PreviewScreen>("booking");
  const workMode = screen === "work" || screen === "detail";

  return (
    <div className="spa-preview-page mx-auto min-h-dvh max-w-md overflow-x-hidden bg-[#f8f5ee] pb-[max(2rem,env(safe-area-inset-bottom))] text-earth-900">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header className="sticky top-0 z-20 border-b border-[#ded8ca] bg-[#f8f5ee]/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-[0.12em] text-primary-700">{storeName}</p>
            <h1 className="mt-0.5 text-lg font-bold">{workMode ? "我的工作" : "會員專區"}</h1>
          </div>
          <span className="shrink-0 rounded-full bg-[#c49a4a]/15 px-3 py-1 text-xs font-semibold text-[#806124]">手機示意</span>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-earth-200/70 p-1" aria-label="切換會員與工作身分">
          <button type="button" onClick={() => setScreen("appointments")} aria-pressed={!workMode} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${!workMode ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`}>會員專區</button>
          <button type="button" onClick={() => setScreen("work")} aria-pressed={workMode} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${workMode ? "bg-primary-800 text-white shadow-sm" : "text-earth-600"}`}>我的工作</button>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto px-4 py-3" aria-label="示意畫面切換">
        {screens.map((item) => (
          <button key={item.id} type="button" onClick={() => setScreen(item.id)} aria-pressed={screen === item.id} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${screen === item.id ? "border-primary-700 bg-primary-700 text-white" : "border-earth-300 bg-white text-earth-700"}`}>
            {item.label}
          </button>
        ))}
      </nav>

      <main className="px-4 pb-8">
        {screen === "booking" ? <BookingPreview onDone={() => setScreen("appointments")} /> : null}
        {screen === "appointments" ? <AppointmentsPreview mapUrl={mapUrl} onBook={() => setScreen("booking")} /> : null}
        {screen === "work" ? <WorkPreview onOpen={() => setScreen("detail")} /> : null}
        {screen === "detail" ? <WorkDetailPreview onBack={() => setScreen("work")} /> : null}
      </main>
    </div>
  );
}

function BookingPreview({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-primary-700">預約服務</p>
        <h2 className="mt-1 text-2xl font-bold">確認本次安排</h2>
        <p className="mt-1 text-sm leading-6 text-earth-600">人數與服務 → 日期 → 時段 → 人員 → 確認</p>
      </div>
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-earth-200/80">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs text-earth-500">主要聯絡人</p><p className="mt-1 font-bold">林怡君</p></div>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">共 2 位</span>
        </div>
        <div className="mt-4 space-y-3 border-t border-earth-100 pt-4">
          <Guest label="第 1 位" service="香氛舒壓 90 分鐘" staff="不指定人員" />
          <Guest label="同行者 2" service="臉部保養 60 分鐘" staff="小安" />
        </div>
      </section>
      <section className="rounded-3xl bg-[#143f32] p-5 text-white shadow-lg">
        <p className="text-sm text-primary-100">2026 年 9 月 16 日・星期三</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">14:30</p>
        <p className="mt-2 text-sm text-primary-100">服務位置將依兩位服務與可用狀態安排</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="min-h-12 rounded-2xl border border-earth-300 bg-white font-semibold text-earth-700">返回修改</button>
        <button type="button" onClick={onDone} className="min-h-12 rounded-2xl bg-primary-700 font-semibold text-white shadow-md">確認預約</button>
      </div>
      <p className="px-2 text-center text-xs leading-5 text-earth-500">送出時會重新檢查服務資格、人員與服務位置；不會因連續點擊建立重複預約。</p>
    </div>
  );
}

function Guest({ label, service, staff }: { label: string; service: string; staff: string }) {
  return <div className="rounded-2xl bg-earth-50 p-4"><p className="text-xs font-semibold text-[#806124]">{label}</p><p className="mt-1 font-semibold">{service}</p><p className="mt-1 text-sm text-earth-600">{staff}</p></div>;
}

function AppointmentsPreview({ mapUrl, onBook }: { mapUrl: string; onBook: () => void }) {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#143f32] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-4"><p className="text-sm font-semibold text-primary-100">下一次預約</p><span className="rounded-full bg-white/10 px-3 py-1 text-xs">已確認</span></div>
        <p className="mt-3 text-2xl font-bold">9 月 16 日・星期三</p><p className="mt-1 text-lg tabular-nums">14:30–16:00</p>
        <p className="mt-4 text-sm text-primary-100">2 位同行・可展開查看各自安排</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="方案剩餘" value="8 次" detail="有效至 12/31" />
        <Metric label="儲值餘額" value="NT$ 2,680" detail="本店可使用" />
      </div>
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-earth-200/80">
        <div className="flex items-center justify-between"><h2 className="font-bold">預約詳情</h2><button type="button" className="min-h-10 rounded-full border border-earth-200 px-3 text-sm">月曆</button></div>
        <div className="mt-4 space-y-3"><Guest label="第 1 位" service="香氛舒壓 90 分鐘" staff="小安・美容床 1" /><Guest label="同行者 2" service="臉部保養 60 分鐘" staff="小美・美容床 2" /></div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-earth-100 pt-4">
          <a href={mapUrl || undefined} aria-disabled={!mapUrl} className="flex min-h-11 items-center justify-center rounded-xl border border-earth-300 text-sm font-semibold">店家導航</a>
          <button type="button" className="min-h-11 rounded-xl border border-red-200 text-sm font-semibold text-red-700">依規則取消</button>
        </div>
      </section>
      <button type="button" onClick={onBook} className="min-h-12 w-full rounded-2xl bg-primary-700 font-semibold text-white">預約其他服務</button>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-earth-200/80"><p className="text-xs text-earth-500">{label}</p><p className="mt-1 break-words text-lg font-bold">{value}</p><p className="mt-1 text-xs text-earth-500">{detail}</p></section>;
}

function WorkPreview({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="space-y-4">
      <div><p className="text-sm font-semibold text-primary-700">今日工作</p><h2 className="mt-1 text-2xl font-bold">9 月 16 日・星期三</h2><p className="mt-1 text-sm text-earth-600">3 筆服務安排；空檔不代表可接單</p></div>
      <section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-earth-200/80">
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDays.map((day) => <button key={day.date} type="button" className={`min-w-0 rounded-xl px-1 py-2 ${day.active ? "bg-primary-700 text-white" : "text-earth-700"}`}><span className="block text-[11px]">{day.weekday}</span><span className="mt-1 block font-bold">{day.date}</span><span className={`mt-1 block text-[10px] ${day.active ? "text-primary-100" : "text-earth-400"}`}>{day.count ? `${day.count} 筆` : "—"}</span></button>)}
        </div>
      </section>
      <div className="space-y-3">
        <WorkCard time="10:00–11:30" cleanup="整理至 11:45" customer="陳雅雯" service="香氛舒壓 90 分鐘" location="美容床 1" status="已確認" onOpen={onOpen} />
        <div className="flex items-center gap-3 px-2 text-xs text-earth-500"><span className="h-px flex-1 bg-earth-300" /><span>空檔 2 小時 45 分</span><span className="h-px flex-1 bg-earth-300" /></div>
        <WorkCard time="14:30–15:30" cleanup="整理至 15:45" customer="林怡君" service="臉部保養 60 分鐘" location="美容床 2" status="待到店" onOpen={onOpen} />
      </div>
      <button type="button" className="min-h-11 w-full rounded-xl border border-earth-300 bg-white text-sm font-semibold">開啟月曆跳至其他日期</button>
    </div>
  );
}

function WorkCard({ time, cleanup, customer, service, location, status, onOpen }: { time: string; cleanup: string; customer: string; service: string; location: string; status: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-earth-200/80 transition active:scale-[0.99]"><div className="flex items-start justify-between gap-3"><div><p className="text-xl font-bold tabular-nums">{time}</p><p className="mt-1 text-xs text-earth-500">{cleanup}</p></div><span className="rounded-full bg-[#c49a4a]/15 px-3 py-1 text-xs font-semibold text-[#806124]">{status}</span></div><p className="mt-4 text-lg font-bold">{customer}</p><p className="mt-1 text-sm text-earth-700">{service}</p><p className="mt-2 text-sm font-medium text-primary-700">{location}</p></button>;
}

function WorkDetailPreview({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="min-h-11 text-sm font-semibold text-earth-600">‹ 返回 9 月 16 日行程</button>
      <section className="rounded-3xl bg-[#143f32] p-5 text-white shadow-lg"><p className="text-sm text-primary-100">已確認・今天</p><p className="mt-2 text-3xl font-bold tabular-nums">14:30–15:30</p><p className="mt-1 text-sm text-primary-100">服務後整理至 15:45</p></section>
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-earth-200/80"><p className="text-xs text-earth-500">顧客</p><h2 className="mt-1 text-xl font-bold">林怡君</h2><dl className="mt-5 space-y-4 text-sm"><Detail label="服務項目" value="臉部保養 60 分鐘" /><Detail label="服務位置" value="美容床 2" /><Detail label="同行安排" value="共 2 位，本卡為第 2 位" /><Detail label="必要備註" value="對香精較敏感；開始前先確認使用品項。" /></dl></section>
      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">第一階段為唯讀工作資訊。完成服務、結帳、退款、改派與拆帳仍由店長後台處理。</aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-earth-500">{label}</dt><dd className="mt-1 font-semibold leading-6 text-earth-900">{value}</dd></div>;
}
