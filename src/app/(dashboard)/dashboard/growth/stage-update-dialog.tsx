"use client";

import { useState, useTransition } from "react";
import { updateTalentStage } from "@/server/actions/talent";
import type { TalentStage } from "@prisma/client";
import { TALENT_STAGE_LABELS, TALENT_STAGE_ORDER } from "@/types/talent";

interface Props {
  customerId: string;
  customerName: string;
  currentStage: TalentStage;
  onClose: () => void;
}

export function StageUpdateDialog({
  customerId,
  customerName,
  currentStage,
  onClose,
}: Props) {
  const [newStage, setNewStage] = useState<TalentStage>(currentStage);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (newStage === currentStage) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await updateTalentStage({
        customerId,
        newStage,
        note: note.trim() || undefined,
      });
      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-earth-800">
          調整人才階段
        </h3>
        <p className="mt-1 text-xs text-earth-400">{customerName}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              新階段
            </label>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value as TalentStage)}
              className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            >
              {TALENT_STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {TALENT_STAGE_LABELS[stage]}
                  {stage === currentStage ? "（目前）" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              備註（選填）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm text-earth-800 placeholder:text-earth-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
              placeholder="例：已完成培訓課程"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-earth-200 px-3 py-2 text-sm text-earth-600 hover:bg-earth-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || newStage === currentStage}
            className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending ? "儲存中…" : "確認"}
          </button>
        </div>
      </div>
    </div>
  );
}
