"use client";

import {
  OFFICIAL_REFERRAL_SHARE_TEMPLATES,
  REFERRAL_SHARE_TEMPLATE_CATEGORIES,
  type OfficialReferralShareTemplate,
} from "@/lib/referral-share-official-templates";
import { renderReferralShareTemplate } from "@/lib/referral-share-template";
import { useMemo, useState } from "react";

interface Props {
  storeName: string;
  previewUrl: string;
  onApply: (template: OfficialReferralShareTemplate) => void;
}

export function ReferralTemplateCenter({ storeName, previewUrl, onApply }: Props) {
  const [category, setCategory] = useState<(typeof REFERRAL_SHARE_TEMPLATE_CATEGORIES)[number]["key"]>("ALL");
  const [previewing, setPreviewing] = useState<OfficialReferralShareTemplate | null>(null);

  const templates = useMemo(
    () =>
      category === "ALL"
        ? OFFICIAL_REFERRAL_SHARE_TEMPLATES
        : OFFICIAL_REFERRAL_SHARE_TEMPLATES.filter((item) => item.category === category),
    [category],
  );

  return (
    <section className="mb-4 rounded-xl border border-earth-200 bg-earth-50/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-earth-800">官方分享模板中心</h3>
          <p className="mt-0.5 text-[10px] text-earth-500">選擇模板、先預覽，再一鍵套用後自由修改</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-earth-500 shadow-sm">
          {OFFICIAL_REFERRAL_SHARE_TEMPLATES.length} 款官方模板
        </span>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {REFERRAL_SHARE_TEMPLATE_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategory(item.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              category === item.key
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-earth-200 bg-white text-earth-600 hover:border-earth-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {templates.map((item) => (
          <article key={item.id} className="rounded-lg border border-earth-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="text-xs font-semibold text-earth-800">{item.title}</h4>
                  {item.badge ? (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-earth-500">{item.description}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewing(item)}
                className="flex-1 rounded-md border border-earth-200 px-2.5 py-1.5 text-[10px] font-medium text-earth-600 hover:bg-earth-50"
              >
                預覽
              </button>
              <button
                type="button"
                onClick={() => onApply(item)}
                className="flex-1 rounded-md bg-primary-600 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-primary-700"
              >
                一鍵套用
              </button>
            </div>
          </article>
        ))}
      </div>

      {previewing ? (
        <div className="mt-3 rounded-lg border border-primary-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-earth-800">{previewing.title} 預覽</p>
              <p className="text-[10px] text-earth-400">實際店名與安全推薦網址會由系統自動帶入</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewing(null)}
              className="text-[10px] font-medium text-earth-400 hover:text-earth-600"
            >
              關閉
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-md bg-earth-50 p-3 text-[11px] leading-relaxed text-earth-700">
            {renderReferralShareTemplate({
              template: previewing.content,
              storeName,
              url: previewUrl,
            })}
          </pre>
          <button
            type="button"
            onClick={() => {
              onApply(previewing);
              setPreviewing(null);
            }}
            className="mt-2 w-full rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
          >
            套用這個模板
          </button>
        </div>
      ) : null}
    </section>
  );
}
