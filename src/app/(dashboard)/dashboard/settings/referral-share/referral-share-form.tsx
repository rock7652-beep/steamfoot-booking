"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

import {
  DEFAULT_REFERRAL_SHARE_TEMPLATE,
  REFERRAL_SHARE_TEMPLATE_MAX_LENGTH,
  ReferralShareTemplateValidationError,
  normalizeReferralShareTemplate,
  renderReferralShareTemplate,
} from "@/lib/referral-share-template";
import type { OfficialReferralShareTemplate } from "@/lib/referral-share-official-templates";
import {
  recordReferralTemplateUsageAction,
  setReferralTemplateFavoriteAction,
} from "@/server/actions/referral-share-template-personalization";
import { updateReferralShareTemplate } from "@/server/actions/referral-share-template";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ReferralTemplateCenter,
  type ReferralTemplateRecentView,
} from "./referral-template-center";

interface Props {
  storeName: string;
  storeSlug: string;
  initialTemplate: string | null;
  initialFavoriteTemplateIds: string[];
  initialRecent: ReferralTemplateRecentView[];
  defaultTemplate?: string;
  previewOrigin?: string;
}

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
  initialFavoriteTemplateIds,
  initialRecent,
  defaultTemplate = DEFAULT_REFERRAL_SHARE_TEMPLATE,
  previewOrigin = "https://www.steamfoot.com",
}: Props) {
  const [template, setTemplate] = useState(
    initialTemplate ?? defaultTemplate,
  );
  const [usesDefault, setUsesDefault] = useState(initialTemplate == null);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState(
    initialFavoriteTemplateIds,
  );
  const [recent, setRecent] = useState(initialRecent);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const error = useMemo(() => getReferralShareTemplateError(template), [template]);
  const previewUrl = `${previewOrigin}/s/${storeSlug}/line-entry?ref=preview`;
  const preview = renderReferralShareTemplate({
    template: error ? defaultTemplate : template,
    storeName,
    url: previewUrl,
  });
  const dirty = usesDefault
    ? template !== defaultTemplate || initialTemplate !== null
    : template !== initialTemplate;
  useSettingsPanelGuard(dirty, pending);

  function addRecent(templateId: string, action: ReferralTemplateRecentView["action"]) {
    setRecent((current) => [
      { templateId, action, createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 20));
  }

  async function recordUsage(
    item: OfficialReferralShareTemplate,
    action: ReferralTemplateRecentView["action"],
  ) {
    addRecent(item.id, action);
    const result = await recordReferralTemplateUsageAction({
      templateId: item.id,
      action,
    });
    if (!result.success) {
      toast.error(result.error ?? "使用紀錄儲存失敗");
    }
  }

  function applyOfficialTemplate(item: OfficialReferralShareTemplate) {
    setTemplate(item.content);
    setUsesDefault(false);
    setActiveTemplateId(item.id);
    void recordUsage(item, "APPLY");
  }

  function previewOfficialTemplate(item: OfficialReferralShareTemplate) {
    void recordUsage(item, "PREVIEW");
  }

  function toggleFavorite(item: OfficialReferralShareTemplate, favorite: boolean) {
    const previous = favoriteTemplateIds;
    setFavoriteTemplateIds((current) =>
      favorite
        ? Array.from(new Set([item.id, ...current]))
        : current.filter((id) => id !== item.id),
    );

    startTransition(async () => {
      const result = await setReferralTemplateFavoriteAction({
        templateId: item.id,
        favorite,
      });
      if (!result.success) {
        setFavoriteTemplateIds(previous);
        toast.error(result.error ?? "收藏更新失敗");
        return;
      }
      toast.success(favorite ? "已加入我的收藏" : "已取消收藏");
      router.refresh();
    });
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

      if (value != null && activeTemplateId) {
        const tracked = await recordReferralTemplateUsageAction({
          templateId: activeTemplateId,
          action: "SAVE",
        });
        if (tracked.success) addRecent(activeTemplateId, "SAVE");
      }

      toast.success(value == null ? "已恢復系統預設文案" : "推薦分享文案已更新");
      setUsesDefault(value == null);
      if (value == null) {
        setTemplate(defaultTemplate);
        setActiveTemplateId(null);
      }
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



        <textarea
          value={template}
          onChange={(event) => {
            setTemplate(event.target.value);
            setUsesDefault(false);
          }}
          rows={8}
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

        <details className="mt-4 rounded-lg border border-earth-200 p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary-700">挑選分享模板</summary>
        <ReferralTemplateCenter
          storeName={storeName}
          previewUrl={previewUrl}
          favoriteTemplateIds={favoriteTemplateIds}
          recent={recent}
          onApply={applyOfficialTemplate}
          onPreview={previewOfficialTemplate}
          onToggleFavorite={toggleFavorite}
        />
        </details>

        {error ? (
          <p id="referral-share-error" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-earth-100 bg-white py-3">
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
