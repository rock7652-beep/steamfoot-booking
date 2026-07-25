"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function select(flow: Flow) {
    setSelectedId(flow.id);
    setName(flow.name);
    setDefinition(JSON.stringify(flow.draftDefinition ?? starterDefinition, null, 2));
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
                onClick={() => {
                  const value = parsed();
                  if (value) run(
                    () => saveDigitalButlerFlowAction({ flowId: selected.id, name, definition: value }),
                    "草稿已儲存",
                  );
                }}
                className="rounded-lg border border-earth-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                儲存草稿
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => publishDigitalButlerFlowAction(selected.id), "流程已發布")}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                驗證並發布
              </button>
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
          </>
        ) : (
          <div className="py-20 text-center text-sm text-earth-500">請先建立第一個流程</div>
        )}
      </section>
    </div>
  );
}
