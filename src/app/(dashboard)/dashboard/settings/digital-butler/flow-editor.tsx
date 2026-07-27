"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  isDigitalButlerDraftDirty,
  publishedMenuOptions,
  publishedOpeningText,
  type PublishedDigitalButlerView,
} from "@/lib/digital-butler-published-view";
import {
  createDigitalButlerFlowAction,
  publishDigitalButlerFlowAction,
  saveDigitalButlerFlowAction,
  setDigitalButlerFlowEnabledAction,
} from "./actions";

type Flow = {
  id: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  enabled: boolean;
  draftDefinition: unknown;
  currentPublishedVersionId: string | null;
  publishedVersion: PublishedDigitalButlerView | null;
};

const starterDefinition = {
  trigger: { keywords: ["我想了解"] },
  steps: [
    { stepKey: "opening", type: "TEXT", config: { text: "您好，請問怎麼稱呼您？" } },
    { stepKey: "name", type: "FREE_TEXT", required: true, config: { text: "請輸入姓名" } },
    { stepKey: "create-lead", type: "CREATE_LEAD", config: {} },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

export function DigitalButlerFlowEditor({ flows }: { flows: Flow[] }) {
  const [selectedId, setSelectedId] = useState(flows[0]?.id ?? "");
  const selected = flows.find((flow) => flow.id === selectedId);
  const [name, setName] = useState(selected?.name ?? "新流程");
  const [definition, setDefinition] = useState(
    JSON.stringify(selected?.draftDefinition ?? starterDefinition, null, 2),
  );
  const [persistedName, setPersistedName] = useState(selected?.name ?? "新流程");
  const [persistedDefinition, setPersistedDefinition] = useState(
    JSON.stringify(selected?.draftDefinition ?? starterDefinition, null, 2),
  );
  const [justPublished, setJustPublished] = useState<{
    id: string; version: number; publishedAt: string | null; menuLabels: string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function select(flow: Flow) {
    setSelectedId(flow.id);
    setName(flow.name);
    const nextDefinition = JSON.stringify(flow.draftDefinition ?? starterDefinition, null, 2);
    setDefinition(nextDefinition);
    setPersistedName(flow.name);
    setPersistedDefinition(nextDefinition);
    setJustPublished(null);
  }

  function parsed(): unknown | null {
    try {
      return JSON.parse(definition);
    } catch {
      toast.error("流程內容不是有效格式");
      return null;
    }
  }

  function run(operation: () => Promise<{ success: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await operation();
      if (!result.success) {
        toast.error(result.error ?? "操作失敗");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  const isDraftDirty = isDigitalButlerDraftDirty({ name, persistedName, definition, persistedDefinition });
  const published = selected?.publishedVersion ?? null;
  const displayedVersion = justPublished ?? (published ? {
    id: published.id,
    version: published.version,
    publishedAt: published.publishedAt ? new Date(published.publishedAt).toISOString() : null,
    menuLabels: publishedMenuOptions(published.steps).map((option) => option.label),
  } : null);

  function saveDraft() {
    const value = parsed();
    if (!value || !selected) return;
    startTransition(async () => {
      const result = await saveDigitalButlerFlowAction({ flowId: selected.id, name, definition: value });
      if (!result.success) {
        toast.error(result.error ?? "操作失敗");
        return;
      }
      setPersistedName(name);
      setPersistedDefinition(definition);
      toast.success("草稿已儲存");
      router.refresh();
    });
  }

  function publishDraft() {
    if (!selected || isDraftDirty) {
      toast.error("請先儲存草稿");
      return;
    }
    startTransition(async () => {
      const result = await publishDigitalButlerFlowAction(selected.id);
      if (!result.success) {
        toast.error(result.error ?? "操作失敗");
        return;
      }
      setJustPublished(result.publishedVersion);
      toast.success(`已發布版本 v${result.publishedVersion.version}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-earth-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-earth-900">流程</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(
              () => createDigitalButlerFlowAction({ name: "新流程", definition: starterDefinition }),
              "已建立草稿",
            )}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            ＋ 新增
          </button>
        </div>
        <div className="space-y-2">
          {flows.map((flow) => (
            <button
              key={flow.id}
              type="button"
              onClick={() => select(flow)}
              className={`w-full rounded-lg border p-3 text-left ${
                flow.id === selectedId ? "border-primary-400 bg-primary-50" : "border-earth-200"
              }`}
            >
              <span className="block text-sm font-medium">{flow.name}</span>
              <span className="text-xs text-earth-500">
                {flow.status === "PAUSED" ? "已暫停" : flow.status === "PUBLISHED" ? "已發布" : "草稿"}
              </span>
            </button>
          ))}
          {flows.length === 0 ? <p className="py-8 text-center text-sm text-earth-500">尚無流程</p> : null}
        </div>
      </aside>

      <section className="rounded-xl border border-earth-200 bg-white p-5">
        {selected ? (
          <>
            <label className="block text-sm font-medium text-earth-700">
              流程名稱
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-earth-200 px-3 py-2"
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-earth-700">
              流程定義
              <textarea
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
                rows={20}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-earth-200 px-3 py-2 font-mono text-xs"
              />
            </label>
            <p className="mt-2 text-xs text-earth-500">
              支援文字、自由文字、單選、台灣手機、建立名單與完成流程；發布前會再次由後端驗證。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={saveDraft}
                className="rounded-lg border border-earth-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                儲存草稿
              </button>
              <button
                type="button"
                disabled={pending || isDraftDirty}
                onClick={publishDraft}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                驗證並發布
              </button>
              {isDraftDirty ? <p className="self-center text-xs text-amber-700">請先儲存草稿後再發布</p> : null}
              {selected.status !== "DRAFT" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(
                    () => setDigitalButlerFlowEnabledAction(selected.id, !selected.enabled),
                    selected.enabled ? "流程已暫停" : "流程已恢復",
                  )}
                  className="rounded-lg border border-earth-300 px-4 py-2 text-sm disabled:opacity-50"
                >
                  {selected.enabled ? "暫停" : "恢復"}
                </button>
              ) : null}
            </div>
            {displayedVersion ? (
              <section className="mt-6 rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm">
                <h3 className="font-semibold text-primary-900">目前正式版</h3>
                <p className="mt-1 text-primary-800">版本 v{displayedVersion.version}</p>
                <p className="break-all text-xs text-primary-700">currentPublishedVersionId: {displayedVersion.id}</p>
                {displayedVersion.publishedAt ? <p className="text-xs text-primary-700">發布時間：{new Date(displayedVersion.publishedAt).toLocaleString("zh-TW")}</p> : null}
                {published ? <p className="mt-2 text-primary-800">開場：{publishedOpeningText(published.steps) ?? "（無）"}</p> : null}
                <ol className="mt-2 list-decimal pl-5 text-primary-900">
                  {displayedVersion.menuLabels.map((label) => <li key={label}>{label}</li>)}
                </ol>
                {published ? (
                  <div className="mt-3 space-y-1 text-xs text-primary-800">
                    {publishedMenuOptions(published.steps).map((option) => (
                      <p key={`${option.value}-${option.label}`}>{option.label} / {option.value} / {option.nextStepKey ?? "（無）"}</p>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          <div className="py-20 text-center text-sm text-earth-500">請先建立第一個流程</div>
        )}
      </section>
    </div>
  );
}
