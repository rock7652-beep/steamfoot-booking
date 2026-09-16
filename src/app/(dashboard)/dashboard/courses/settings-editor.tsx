"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCourseSettings } from "@/server/actions/course-settings";
export function CourseSettingsEditor({
  name, bankName, bankCode, bankAccountNumber,
  address, mapUrl, lineOfficialUrl,
  bookingLeadMinutes,
  cancellationLeadMinutes,
  canEdit,
}: {
  name: string; bankName: string; bankCode: string; bankAccountNumber: string;
  address: string; mapUrl: string; lineOfficialUrl: string;
  bookingLeadMinutes: number;
  cancellationLeadMinutes: number;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  const router = useRouter();
  const field = "mt-1 min-h-11 w-full rounded-lg border border-earth-200 p-2";
  return (
    <form
      className="max-w-xl space-y-4 rounded-lg border bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        start(async () => {
          try {
            const r = await saveCourseSettings({
              name: d.get("name"), bankName: d.get("bankName"), bankCode: d.get("bankCode"), bankAccountNumber: d.get("bankAccountNumber"),
              address: d.get("address"), mapUrl: d.get("mapUrl"), lineOfficialUrl: d.get("lineOfficialUrl"),
              bookingLeadMinutes: Number(d.get("booking")),
              cancellationLeadMinutes: Number(d.get("cancel")),
            });
            setMessage(r.success ? "已儲存" : r.error);
            if (r.success) router.refresh();
          } catch {
            setMessage("連線失敗，請重試");
          }
        });
      }}
    >
      <label className="block">
        店家名稱
        <input
          className={field}
          name="name"
          defaultValue={name}
          required
          disabled={!canEdit}
        />
      </label>
      {([ ["address", "店家地址", address], ["mapUrl", "地圖網址", mapUrl], ["lineOfficialUrl", "LINE 官方帳號網址", lineOfficialUrl] ] as const).map(([key, label, value]) => <label key={key} className="block">{label}<input className={field} name={key} type={key === "address" ? "text" : "url"} defaultValue={value} disabled={!canEdit} /></label>)}
      <h2>線上購買收款資訊</h2>
      {([["bankName","銀行名稱",bankName],["bankCode","銀行代碼",bankCode],["bankAccountNumber","收款帳號",bankAccountNumber]] as const).map(([key,label,value])=><label key={key} className="block">{label}<input className={field} name={key} defaultValue={value} disabled={!canEdit}/></label>)}
      <h2 className="border-b border-gold-300 pb-2 font-semibold text-primary-800">預約與取消規則</h2>
      <label className="block">
        上課前幾分鐘截止預約
        <input
          className={field}
          name="booking"
          type="number"
          min={0}
          max={43200}
          defaultValue={bookingLeadMinutes}
          required
          disabled={!canEdit}
        />
      </label>
      <label className="block">
        上課前幾分鐘截止自行取消
        <input
          className={field}
          name="cancel"
          type="number"
          min={0}
          max={43200}
          defaultValue={cancellationLeadMinutes}
          required
          disabled={!canEdit}
        />
      </label>
      <p className="text-sm text-earth-500">
        0
        表示上課開始前可操作。預約保留方案額度，出席才正式使用；取消或未到釋放占用。截止後請由店長處理，不另加取消費用。
      </p>
      {message && <p role="status">{message}</p>}
      {canEdit && (
        <div className="sticky bottom-0 bg-white py-3">
          <button
            className="min-h-11 w-full rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50"
            disabled={pending}
          >
            儲存設定
          </button>
        </div>
      )}
    </form>
  );
}
