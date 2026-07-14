"use client";

import {
  DEFAULT_REFERRAL_SHARE_TEMPLATE,
  REFERRAL_SHARE_TEMPLATE_MAX_LENGTH,
  ReferralShareTemplateValidationError,
  normalizeReferralShareTemplate,
  renderReferralShareTemplate,
} from "@/lib/referral-share-template";
import { updateReferralShareTemplate } from "@/server/actions/referral-share-template";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

interface Props {
  storeName: string;
  storeSlug: string;
  initialTemplate: string | null;
}

export const REFERRAL_SHARE_EXAMPLES = [
  {
    key: "steamfoot",
    label: "蒸足／放鬆",
    template: [
      "我最近去「{storeName}」放鬆了一下",
      "整個人暖暖的，晚上也睡得特別好 😊",
      "",
      "最近有點累的話，可以去看看👇",
      "{url}",
    ].join("\n"),
  },
  {
    key: "beauty",
    label: "美容／美甲",
    template: [
      "最近在「{storeName}」做了一次保養",
      "環境舒服，完成後整個人都更有精神 ✨",
      "",
      "想找時間好好照顧自己，可以看看👇",
      "{url}",
    ].join("\n"),
  },
  {
    key: "fitness",
    label: "健身／運動",
    template: [
      "最近在「{storeName}」開始運動",
      "教練很有耐心，過程也不會讓人有壓力 💪",
      "",
      "想動一動、找回精神，可以先看看👇",
      "{url}",
    ].join("\n"),
  },
  {
    key: "massage",
    label: "按摩／療癒",
    template: [
      "最近去「{storeName}」放鬆",
      "做完整個肩頸輕鬆很多，氣氛也很舒服 🌿",
      "",
      "最近身體有點緊繃的話，可以看看👇",
      "{url}",
    ].join("\n"),
  },
  {
    key: "course",
    label: "課程／教室",
    template: [
      "最近在「{storeName}」體驗了一堂課",
      "老師講得很清楚，第一次參加也不會有壓力 🙌",
      "",
      "正在找適合自己的課程，可以先看看👇",
      "{url}",
    ].join("\n"),
  },
] as const;

export function getReferralShareTemplateError(value: string): string | null {
  try {
    normalizeReferralShareTemplate(value);
    return null;
  } catch (error) {
    return error instanceof ReferralShareTemplateValidationError
      ? error.message
      : "文案格式不正確";
  }
}

export function ReferralShareSettingsForm({
  storeName,
  storeSlug,
  initialTemplate,
}: Props) {
  const [template, setTemplate] = useState(
    initialTemplate ?? DEFAULT_REFERRAL_SHARE_TEMPLATE,
  );
  const [usesDefault, setUsesDefault] = useState(initialTemplate == null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const error = useMemo(() => getReferralShareTemplateError(template), [template]);
  const previewUrl = `https://www.steamfoot.com/s/${storeSlug}/line-entry?ref=preview`;
  const preview = renderReferralShareTemplate({
    template: error ? null : template,
    storeName,
    url: previewUrl,
  });
  const dirty = usesDefault
    ? template !== DEFAULT_REFERRAL_SHARE_TEMPLATE || initialTemplate !== null
    : template !== initialTemplate;

  function applyExample(exampleTemplate: string) {
    setTemplate(exampleTemplate);
    setUsesDefault(false);
  }

  function save(value: string | null) {
    startTransition(async () => {
      const result = await updateReferralShareTemplate({
        referralShareTemplate: value,
      });
      if (!result.success) {
        toast.error(result.error ?? "儲存失敗");
        return;
      }
      toast.success(value == null ? "已恢復系統預設文案" : "推薦分享文案已更新");
      setUsesDefault(value == null);
      if (value == null) setTemplate(DEFAULT_REFERRAL_SHARE_TEMPLATE);
      router.refresh();
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (error) {
      toast.error(error);
      return;
    }
    save(template);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm lg:col-span-7">
        <header className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-earth-900">編輯分享文案</h2>
            <span className="rounded-full bg-earth-50 px-2 py-0.5 text-[10px] font-medium text-earth-500">
              {usesDefault ? "系統預設" : "店家自訂"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-earth-500">
            可使用 <code>{"{storeName}"}</code> 與 <code>{"{url}"}</code>；網址必須且只能出現一次。
          </p>
        </header>

        <div className="mb-4 rounded-lg border border-earth-200 bg-earth-50/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-earth-700">套用產業範例</p>
            <span className="text-[10px] text-earth-400">套用後仍可自由修改</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {REFERRAL_SHARE_EXAMPLES.map((example) => (
              <button
                key={example.key}
                type="button"
                disabled={pending}
                onClick={() => applyExample(example.template)}
                className="rounded-full border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-60"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={template}
          onChange={(event) => {
            setTemplate(event.target.value);
            setUsesDefault(false);
          }}
          rows={16}
          maxLength={REFERRAL_SHARE_TEMPLATE_MAX_LENGTH}
          className="block w-full resize-y rounded-lg border border-earth-300 bg-white px-3 py-3 text-sm leading-relaxed text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
          aria-describedby="referral-share-help referral-share-error"
        />

        <div className="mt-2 flex items-start justify-between gap-3 text-[11px]">
          <p id="referral-share-help" className="text-earth-500">
            店名與推薦網址會在顧客分享當下由系統自動帶入，店長無法修改推薦碼或導流目的地。
          </p>
          <span className={template.length > 1900 ? "font-semibold text-amber-700" : "text-earth-400"}>
            {template.length}/{REFERRAL_SHARE_TEMPLATE_MAX_LENGTH}
          </span>
        </div>

        {error ? (
          <p id="referral-share-error" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-earth-100 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="rounded-lg border border-earth-200 px-3 py-2 text-sm font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-60"
          >
            恢復系統預設
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-earth-400">
              {pending ? "儲存中..." : dirty ? "尚未儲存" : "已儲存"}
            </span>
            <button
              type="submit"
              disabled={pending || Boolean(error)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "儲存中..." : "儲存文案"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-earth-200 bg-earth-50/40 p-5 shadow-sm lg:sticky lg:top-4 lg:col-span-5 lg:self-start">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-earth-900">顧客分享預覽</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-earth-500">
            即時預覽
          </span>
        </header>
        <div className="whitespace-pre-wrap rounded-xl border border-earth-200 bg-white p-4 text-sm leading-relaxed text-earth-800">
          {preview}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-earth-500">
          預覽網址使用測試推薦碼；正式分享時會換成登入顧客本人的安全推薦連結。
        </p>
      </section>
    </form>
  );
}
