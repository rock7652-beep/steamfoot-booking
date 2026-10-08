"use client";
import { useEffect, useRef, useState } from "react";
import { focusTrialFormError } from "@/lib/trial-form-error";
import {
  applicationStatuses,
  emptyTrialApplication,
  trialApplicationSchema,
  trialDraftSchema,
  trialChecklist,
  setupSections,
  attachmentSchema,
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
  const formRef = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<TrialApplicationData>(emptyTrialApplication);
  const [receipt, setReceipt] = useState<Receipt>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [resumeBlocked, setResumeBlocked] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    const key = Object.keys(errors).find((key) => errors[key]);
    if (key && formRef.current) focusTrialFormError(formRef.current, key);
  }, [errors]);
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
              setData(
                sameRevision && cachedData
                  ? cachedData
                  : { ...emptyTrialApplication, ...result.data },
              );
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
    key: Exclude<keyof TrialApplicationData, "attachments">,
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
    key: Exclude<keyof TrialApplicationData, "attachments">,
    label: string,
    values: [string, string][],
  ) {
    return (
      <label className="block">
        {label}
        <select
          className={inputClass}
          name={key}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
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
        {errors[key] && (
          <span id={`${key}-error`} className="text-sm text-red-700">
            {errors[key]}
          </span>
        )}
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
      setMessage(valid.error.issues[0]?.message ?? "請確認標示的欄位");
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
      setMessage(
        "已收到申請！我們會聯絡您確認 LINE 串接並安排視訊，帶您完成第一筆預約。需要補充資料時，可回到這裡繼續填寫。",
      );
    } catch {
      setMessage("連線中斷，請再次送出。填寫內容已保留。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form ref={formRef} noValidate onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-[#e1d8c7] bg-[#fffdf7] p-4">
        <p className="font-medium">申請只需先準備</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>✓ 店家名稱、聯絡人、電話與 Email</li>
          <li>✓ 有官方 LINE 可先提供；串接與管理員授權由我們引導</li>
          <li>✓ 無須準備完整課表或方案，視訊時帶您建立第一筆預約</li>
        </ul>
      </div>
      <section className="rounded-2xl border border-[#dce3dc] bg-white p-5 sm:p-6">
        <h2 className="mb-5 text-xl font-semibold">1 · 店家與聯絡人</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("storeName", "本次申請的門市名稱 *")}
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
        <details className="mt-4 rounded-lg border border-[#dce3dc] p-3">
          <summary className="cursor-pointer font-medium">
            補充資料（選填）
          </summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {field("brandName", "所屬品牌（選填）")}
            {field("otherStores", "其他申請門市（選填）", {
              hint: "每間門市各填一份，可以使用相同聯絡人與 Email。",
            })}
            {field("slug", "希望使用的網址英文名稱（選填）", {
              hint: "例如 butler；使用小寫英文、數字或短橫線。留空由我們協助，送出後確認是否可用。",
            })}
            {field("additionalManagers", "其他後台使用者姓名／Email（選填）", {
              hint: "體驗版最多 3 位後台使用者；教練前台 LINE 身分另行設定，也可開通後再新增。",
            })}
          </div>
        </details>
        <p className="mt-4 text-sm text-[#64736b]">
          本次只填一間門市。多間門市可分別申請；送出後使用下方「申請另一間門市」。
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
            hint: "權限選「管理員」，供 rock7652@gmail.com 工作帳號接受；連結 24 小時有效，過期請重新補件。",
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field(
            "lineManagerContact",
            "LINE 設定協助者姓名／聯絡方式（選填）",
            {
              hint: "若由其他人協助 LINE 設定，請留下聯絡方式；聯絡人自己管理就不用重填。",
            },
          )}
          {select("sharedLine", "這個 LINE 是否由其他門市共用？", [
            ["unknown", "不確定"],
            ["no", "沒有，本店專用"],
            ["yes", "有，其他門市共用"],
          ])}
          {data.sharedLine === "yes" &&
            field("sharedLineStores", "共用 LINE 的門市名稱")}
        </div>
        <p className="mt-4 text-sm text-[#64736b]">
          LINE 串接由我們協助；需要補充資料時會再聯絡，不需提供帳號密碼。
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
        <StageList items={trialChecklist(data).slice(2, 4)} />
      </section>
      <section className="rounded-2xl border border-[#dce3dc] bg-white p-5 sm:p-6">
        <h2 className="text-xl font-semibold">3 · 視訊操作教學</h2>
        <p className="mt-2 text-sm text-[#64736b]">
          我們會帶您排好第一堂課，實際完成預約與報到。無須事先準備完整課表或方案，有現成資料也歡迎提供。
        </p>
        <p className="mt-3 text-sm">
          請準備電腦或 iPad 操作後台，以及手機測試 LINE 預約。
        </p>
        <details className="mt-4 rounded-lg border border-[#dce3dc] p-3">
          <summary className="cursor-pointer font-medium">
            已有設定資料？可先補充（選填）
          </summary>
          <div className="mt-4 divide-y divide-[#dce3dc]">
            {setupSections.map(([progress, notes, label, hint]) => (
              <details key={progress} className="py-3">
                <summary className="cursor-pointer text-base font-medium">
                  {label} ·{" "}
                  {
                    {
                      provided: "已填／見附件",
                      none: "不需要",
                      help: "需要協助",
                      pending: "待提供",
                    }[data[progress]]
                  }
                </summary>
                <div className="mt-3 grid gap-3">
                  {select(progress, "提供方式", [
                    ["pending", "待提供"],
                    ["provided", "已填下方資料／見附件"],
                    ["none", "不需要"],
                    ["help", "需要協助"],
                  ])}
                  {data[progress] === "provided" &&
                    field(notes, "簡要資料／附件名稱", { hint })}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-4">
            {select("importStudents", "是否需要匯入現有學員？", [
              ["pending", "尚未確認"],
              ["yes", "需要，請提供匯入格式"],
              ["no", "不需要"],
              ["help", "需要協助"],
            ])}
          </div>
          <p className="mt-2 text-sm text-[#64736b]">
            需要匯入時，我們會提供姓名、電話、方案、剩餘堂數與到期日的格式。
          </p>
        </details>
        <label className="mt-4 block">
          課表／方案等附件（選填）
          <input
            className={inputClass}
            type="file"
            name="attachments"
            aria-invalid={!!errors.attachments}
            aria-describedby={
              errors.attachments ? "attachments-error" : undefined
            }
            disabled={uploading || busy}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (
                files.length + data.attachments.length > 3 ||
                files.reduce(
                  (n, f) => n + f.size,
                  data.attachments.reduce(
                    (n, f) => n + atob(f.content).length,
                    0,
                  ),
                ) >
                  2 * 1024 * 1024
              ) {
                setErrors({
                  ...errors,
                  attachments: "最多 3 個附件，合計 2 MB；請先壓縮照片或 PDF。",
                });
                return;
              }
              setUploading(true);
              try {
                const added = await Promise.all(
                  files.map(async (file) => {
                    const content = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve(String(reader.result).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                      },
                    );
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    return attachmentSchema.parse({
                      name: file.name,
                      type: ext === "jpeg" ? "jpg" : ext,
                      content,
                    });
                  }),
                );
                setData((current) => ({
                  ...current,
                  attachments: [...current.attachments, ...added],
                }));
                setSaved(false);
                setErrors((current) => ({ ...current, attachments: "" }));
              } catch {
                setErrors((current) => ({
                  ...current,
                  attachments:
                    "附件格式不支援，請使用 PDF、照片、xlsx、docx 或 CSV。",
                }));
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <p className="mt-1 text-sm text-[#64736b]">
          最多 3 個檔案，合計 2 MB。沒有現成資料也沒關係，視訊時一起建立。
        </p>
        {errors.attachments && (
          <p
            id="attachments-error"
            role="alert"
            className="text-sm text-red-700"
          >
            {errors.attachments}
          </p>
        )}
        <ul className="mt-2 space-y-2 text-sm">
          {data.attachments.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="break-all">{a.name}</span>
              <button
                type="button"
                className="shrink-0 rounded border px-3 py-2"
                onClick={() => {
                  setData({
                    ...data,
                    attachments: data.attachments.filter((_, j) => j !== i),
                  });
                  setSaved(false);
                }}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-[#c8d9ce] bg-[#edf4ef] p-5">
        <h2 className="text-xl font-semibold">最後確認</h2>
        <ul className="mt-4 space-y-3">
          {trialChecklist(data)
            .slice(0, 4)
            .map((item) => (
              <li
                key={item.label}
                className="flex flex-wrap justify-between gap-2 text-sm"
              >
                <span>{item.label}</span>
                <strong
                  className={
                    ["已提供", "不需要", "無既有串接"].includes(item.state)
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
          送出申請 → 確認 LINE 串接 → 安排視訊 →
          完成第一筆預約。其他設定依需求逐步建立。請勿提供密碼或密鑰。
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
        disabled={!ready || busy || uploading || resumeBlocked}
        className="w-full rounded-xl bg-[#315e49] px-6 py-4 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "處理中…" : receipt?.id ? "送出補充資料" : "送出體驗申請"}
      </button>
      {receipt?.id && (
        <button
          type="button"
          disabled={busy || uploading}
          className="w-full rounded-xl border border-[#315e49] px-4 py-3 text-[#315e49]"
          onClick={() => {
            if (
              !saved &&
              !window.confirm(
                "目前有未送出的修改。離開會清除本機草稿，確定改申請另一間門市？",
              )
            )
              return;
            setData({
              ...emptyTrialApplication,
              brandName: data.brandName,
              contactName: data.contactName,
              phone: data.phone,
              email: data.email,
            });
            setReceipt(undefined);
            setSaved(false);
            setMessage("");
            setErrors({});
            location.hash = "";
          }}
        >
          申請另一間門市
        </button>
      )}
      <p className="pb-8 text-center text-sm text-[#64736b]">
        {storageWarning
          ? "請保存補件連結"
          : "本機自動暫存 · 教學另開視窗，填寫內容不會消失"}
      </p>
    </form>
  );
}
