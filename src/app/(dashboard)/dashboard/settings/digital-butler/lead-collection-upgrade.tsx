"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  previewDigitalButlerLeadCollectionUpgradeAction,
  publishDigitalButlerLeadCollectionUpgradeAction,
  type LeadCollectionUpgradePreviewResult,
} from "./actions";

type Props = { storeName: string; storeSlug: string };

export function DigitalButlerLeadCollectionUpgrade({ storeName, storeSlug }: Props) {
  const [preview, setPreview] = useState<Extract<LeadCollectionUpgradePreviewResult, { success: true }> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState<{ id: string; version: number } | null>(null);

  function loadPreview() {
    startTransition(async () => {
      const result = await previewDigitalButlerLeadCollectionUpgradeAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPreview(result);
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishDigitalButlerLeadCollectionUpgradeAction(confirmation);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPublished({ id: result.newActiveVersionId, version: result.newActiveVersion });
      toast.success(result.alreadyUpgraded ? "此流程已是完整名單收集版本" : "已建立並發布新的流程版本");
    });
  }

  if (published) {
    return (
      <section className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm">
        <h2 className="font-semibold text-primary-900">完整名單收集流程已發布</h2>
        <p className="mt-1 text-primary-800">新 active version：v{published.version}</p>
        <p className="break-all text-xs text-primary-700">{published.id}</p>
        <p className="mt-2 text-xs text-primary-800">建議到 Messenger 重新測試姓名、手機與確認流程。</p>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <h2 className="font-semibold text-amber-950">升級為完整名單收集流程</h2>
      <p className="mt-1 text-amber-900">{storeName}（{storeSlug}）的目前發布版本可安全升級；舊版本不會被修改。</p>
      {!preview ? (
        <button type="button" onClick={loadPreview} disabled={pending} className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50">
          預覽升級
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-1 rounded-lg border border-amber-200 bg-white p-3 text-xs text-earth-700 sm:grid-cols-2">
            <p>流程：{preview.preview.flowName}</p>
            <p>flow id：{preview.preview.flowId}</p>
            <p>目前版本：v{preview.preview.currentActiveVersion}</p>
            <p>active conversation：{preview.preview.activeConversationCount}</p>
            <p className="sm:col-span-2">目前 step keys：{preview.preview.currentStepKeys.join(", ")}</p>
            <p className="sm:col-span-2">升級後 step keys：{preview.preview.upgradedStepKeys.join(", ")}</p>
            <p className="sm:col-span-2">新增：{preview.preview.addedStepKeys.join(", ") || "無"}</p>
          </div>
          <p className="text-xs text-amber-950">保留既有 trigger、介紹內容與其他分流。新 conversation 使用新版本；既有 conversation 維持原版本。LINE 與 Messenger 共用相同完整名單收集能力。</p>
          <p className="font-medium text-amber-950">將建立新的不可變更版本，不會修改舊版本。</p>
          <label className="block text-xs font-medium text-earth-700">
            請輸入 <code className="rounded bg-white px-1">{storeSlug}</code> 確認發布
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm" />
          </label>
          <button type="button" onClick={publish} disabled={pending || confirmation !== storeSlug || preview.preview.alreadyUpgraded} className="rounded-lg bg-primary-700 px-3 py-2 text-sm text-white disabled:opacity-50">
            確認發布
          </button>
          {preview.preview.alreadyUpgraded ? <p className="text-xs text-earth-600">目前 active version 已包含完整名單收集步驟，不會建立重複版本。</p> : null}
        </div>
      )}
    </section>
  );
}
