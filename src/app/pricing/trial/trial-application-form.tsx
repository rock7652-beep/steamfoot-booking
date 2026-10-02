"use client";
import { useEffect, useState } from "react";
import {
  applicationStatuses,
  emptyTrialApplication,
  trialApplicationSchema,
  trialDraftSchema,
  trialChecklist,
  TRIAL_CONTACT_EMAIL,
  type TrialApplicationData,
} from "@/lib/trial-application";
const KEY = "steambutler-trial-application-v1";
type Receipt = {
  requestId: string;
  token: string;
  id?: string;
  revision?: number;
  status?: string;
};
const inputClass =
  "mt-2 w-full rounded-lg border border-[#d4ddd6] bg-white px-3 py-2.5 text-base focus:outline focus:outline-2 focus:outline-[#467560]";
function Guide({ topic, label }: { topic: string; label: string }) {
  return (
    <a
      className="ml-auto text-sm font-medium text-[#386650] underline underline-offset-4"
      href={`/pricing/trial/guide/${topic}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label} ↗
    </a>
  );
}
function StageList({ items }: { items: ReturnType<typeof trialChecklist> }) {
  return (
    <ul className="mt-4 space-y-1 border-t border-[#e1e7e2] pt-3 text-sm text-[#64736b]">
      {items.map((i) => (
        <li key={i.label}>
          {i.label}：{i.state}
        </li>
      ))}
    </ul>
  );
}
export function TrialApplicationForm() {
  const [data, setData] = useState<TrialApplicationData>(emptyTrialApplication);
  const [receipt, setReceipt] = useState<Receipt>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [resumeBlocked, setResumeBlocked] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    let active = true;
    async function restore() {
      let cachedReceipt: Receipt | undefined;
      let cachedData: TrialApplicationData | undefined;
      try {
        const cached = localStorage.getItem(KEY);
        if (cached) {
          const c = JSON.parse(cached);
          const checked = trialDraftSchema.safeParse(c.data);
          if (checked.success) {
            cachedData = { ...emptyTrialApplication, ...checked.data };
            setData(cachedData);
          }
          if (
            c.receipt &&
            typeof c.receipt.requestId === "string" &&
            /^[a-f0-9]{64}$/.test(c.receipt.token ?? "")
          ) {
            cachedReceipt = c.receipt;
            setReceipt(c.receipt);
          }
        }
      } catch {
        if (active) setStorageWarning(true);
      }
      const params = new URLSearchParams(location.hash.slice(1));
      const requestId =
        params.get("application") ??
        (cachedReceipt?.id ? cachedReceipt.requestId : null);
      const token =
        params.get("token") ?? (cachedReceipt?.id ? cachedReceipt.token : null);
      try {
        if (requestId && token) {
          setBusy(true);
          const res = await fetch("/api/trial-applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, token, action: "read" }),
          });
          const result = await res.json();
          if (active) {
            if (res.ok) {
              const sameRevision =
                cachedReceipt?.requestId === requestId &&
                cachedReceipt?.token === token &&
                cachedReceipt?.revision === result.revision;
              setData(sameRevision && cachedData ? cachedData : result.data);
              setReceipt({
                requestId,
                token,
                id: result.id,
                revision: result.revision,
                status: result.status,
              });
            } else {
              setMessage(result.error);
              setResumeBlocked(true);
            }
          }
        }
      } catch {
        if (active) {
          setResumeBlocked(true);
          setMessage("無法讀取原申請，請重新載入再補件。");
        }
      } finally {
        if (active) {
          setReady(true);
          setBusy(false);
        }
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ data, receipt }));
    } catch {
      setStorageWarning(true);
    }
  }, [data, receipt, ready]);
  function field(
    key: keyof TrialApplicationData,
    label: string,
    options?: {
      type?: string;
      guide?: string;
      guideLabel?: string;
      hint?: string;
    },
  ) {
    return (
      <label className="block">
        <span className="flex items-center gap-3">
          <span>{label}</span>
          {options?.guide && (
            <Guide
              topic={options.guide}
              label={options.guideLabel ?? "圖解教學"}
            />
          )}
        </span>
        <input
          className={inputClass}
          name={key}
          required={["storeName", "contactName", "phone", "email"].includes(
            key,
          )}
          type={options?.type ?? "text"}
          value={data[key]}
          autoComplete={
            key === "email" ? "email" : key === "phone" ? "tel" : "off"
          }
          maxLength={options?.type === "url" ? 2000 : 200}
          onChange={(e) => {
            setSaved(false);
            setData({ ...data, [key]: e.target.value });
          }}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
        />
        {options?.hint && (
          <span className="mt-1 block text-sm text-[#64736b]">
            {options.hint}
          </span>
        )}
        {errors[key] && (
          <span id={`${key}-error`} className="text-sm text-red-700">
            {errors[key]}
          </span>
        )}
      </label>
    );
  }
  function select(
    key: keyof TrialApplicationData,
    label: string,
    values: [string, string][],
  ) {
    return (
      <label className="block">
        {label}
        <select
          className={inputClass}
          value={data[key]}
          onChange={(e) => {
            setSaved(false);
            setData({ ...data, [key]: e.target.value });
          }}
        >
          {values.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    const valid = trialApplicationSchema.safeParse(data);
    if (!valid.success) {
      setErrors(
        Object.fromEntries(
          valid.error.issues.map((i) => [i.path[0], i.message]),
        ),
      );
      setMessage("請確認標示的欄位");
      return;
    }
    setErrors({});
    setBusy(true);
    const credentials = receipt ?? {
      requestId: crypto.randomUUID(),
      token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    };
    setReceipt(credentials);
    try {
      const res = await fetch("/api/trial-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          id: undefined,
          status: undefined,
          action: "save",
          data: valid.data,
          website: new FormData(e.currentTarget).get("website") ?? "",
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error);
        return;
      }
      setReceipt({ ...credentials, ...result });
      setSaved(true);
      setMessage("申請已收到！尚未備齊的資料，可以在這裡補充後再次送出。");
    } catch {
      setMessage("連線中斷，請再次送出。填寫內容已保留。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="rounded-xl border border-[#e1d8c7] bg-[#fffdf7] p-4">
        <p className="font-medium">申請前準備</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>✓ 店家名稱、聯絡人、電話與 Email</li>
          <li>✓ 官方 LINE ID、好友連結與管理員邀請（可後補）</li>
          <li>✓ LINE Developers 授權（不清楚可選需要協助）</li>
        </ul>
      </div>
      <section className="rounded-2xl border border-[#dce3dc] bg-white p-5 sm:p-6">
        <h2 className="mb-5 text-xl font-semibold">1 · 店家與聯絡人</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("storeName", "店家名稱 *")}
          {select(
            "industry",
            "店家類型",
            ["運動教室", "音樂教室", "蒸足／養生", "其他"].map((v) => [v, v]),
          )}
          {field("contactName", "聯絡人 *")}
          {field("phone", "聯絡電話 *", { type: "tel" })}
          {field("email", "登入／聯絡 Email *", { type: "email" })}
          {field("mapsUrl", "Google 地圖連結（選填）", {
            type: "url",
            guide: "maps",
            guideLabel: "取得地圖連結",
          })}
        </div>
        <p className="mt-4 text-sm text-[#64736b]">
          填一間體驗店家即可，課表與授課人員稍後設定。
        </p>
        <StageList items={trialChecklist(data).slice(0, 2)} />
      </section>
      <section className="rounded-2xl border border-[#dce3dc] bg-white p-5 sm:p-6">
        <h2 className="mb-5 text-xl font-semibold">2 · 官方 LINE</h2>
        {select("lineStatus", "目前有官方 LINE 嗎？", [
          ["existing", "有，我來填資料"],
          ["new", "還沒有，我要申請"],
          ["help", "不確定，需要協助"],
        ])}
        {data.lineStatus !== "existing" && (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm">
            <p>
              {data.lineStatus === "new"
                ? "先在新視窗建立官方 LINE，完成後回來填寫。"
                : "可以先送出，我們會協助確認。"}
            </p>
            <div className="mt-2 flex gap-4">
              <a
                href="https://tw.linebiz.com/account/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                申請官方 LINE ↗
              </a>
              <Guide topic="create" label="申請指南" />
            </div>
          </div>
        )}
        <div className="mt-5 grid gap-5">
          {field("lineId", "官方 LINE ID", {
            guide: "line-id",
            guideLabel: "查看 ID",
            hint: "例如 @abc123；不是個人 LINE ID",
          })}
          {field("friendUrl", "加入好友連結", {
            type: "url",
            guide: "friend",
            guideLabel: "取得好友連結",
          })}
          {field("inviteUrl", "管理員邀請連結", {
            type: "url",
            guide: "oa-admin",
            guideLabel: "產生管理員邀請",
            hint: "選「管理員」，邀請連結通常 24 小時有效；過期可重新補件。",
          })}
        </div>
        <StageList items={trialChecklist(data).slice(2, 4)} />
      </section>
      <section className="rounded-2xl border border-[#dce3dc] bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap gap-3">
          <h2 className="text-xl font-semibold">3 · Developers 授權</h2>
          <Guide topic="developers" label="邀請管理員圖解" />
        </div>
        <p className="mb-4 text-sm">
          邀請對象：
          <strong className="select-all">{TRIAL_CONTACT_EMAIL}</strong>
        </p>
        {select("developers", "授權進度", [
          ["pending", "尚未邀請"],
          ["invited", "已邀請，請蒸管家確認"],
          ["help", "沒有設定／找不到，需要協助"],
        ])}
        <p className="mt-3 text-sm text-[#64736b]">
          官方 LINE 與 Developers 是兩個後台。Provider 與 Channel
          權限也需分別確認；登入、LIFF 和通知由蒸管家設定。
        </p>
        <div className="mt-5 grid gap-5">
          {select("integration", "官方 LINE 有接其他系統嗎？", [
            ["unknown", "不確定，請協助確認"],
            ["none", "沒有"],
            ["existing", "有其他預約／聊天系統"],
          ])}
          {data.integration === "existing" &&
            field("integrationName", "目前使用的系統")}
        </div>
        <StageList items={trialChecklist(data).slice(4)} />
      </section>
      <section className="rounded-2xl border border-[#c8d9ce] bg-[#edf4ef] p-5">
        <h2 className="text-xl font-semibold">最後確認</h2>
        <ul className="mt-4 space-y-3">
          {trialChecklist(data).map((item) => (
            <li
              key={item.label}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span>{item.label}</span>
              <strong
                className={
                  item.state.startsWith("已")
                    ? "text-[#386650]"
                    : "text-amber-800"
                }
              >
                {item.state}
              </strong>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          送出後由蒸管家確認資料及權限，再聯繫你安排設定。請勿提供密碼、Token 或
          Secret。
        </p>
      </section>
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {storageWarning && (
        <p className="text-sm text-amber-800">
          瀏覽器無法暫存；請保持此頁開啟，完成後保存補件連結。
        </p>
      )}
      {receipt?.id && (
        <div className="rounded-xl border bg-white p-4 text-sm">
          <p>申請編號：{receipt.id}</p>
          <p className="mt-1">
            處理進度：
            {applicationStatuses[
              receipt.status as keyof typeof applicationStatuses
            ] ?? "已收件"}
          </p>
          <button
            type="button"
            className="mt-3 underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/pricing/trial#application=${receipt.requestId}&token=${receipt.token}`,
                );
                setMessage("補件連結已複製，請自行保存，勿公開分享。");
              } catch {
                setMessage("無法複製，請使用同一瀏覽器回到申請頁補件。");
              }
            }}
          >
            複製專屬補件連結
          </button>
        </div>
      )}
      {message && (
        <p
          role="status"
          className={`rounded-lg p-4 ${saved ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-900"}`}
        >
          {message}
        </p>
      )}
      <button
        disabled={!ready || busy || resumeBlocked}
        className="w-full rounded-xl bg-[#315e49] px-6 py-4 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "處理中…" : receipt?.id ? "送出補充資料" : "送出體驗申請"}
      </button>
      <p className="pb-8 text-center text-sm text-[#64736b]">
        {storageWarning
          ? "請保存補件連結"
          : "本機自動暫存 · 教學另開視窗，填寫內容不會消失"}
      </p>
    </form>
  );
}
