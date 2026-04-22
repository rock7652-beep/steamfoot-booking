"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createBonusRule } from "@/server/actions/bonus-rule";

/**
 * 推薦玩法卡 — 獎勵項目管理頁 A 區
 *
 * 3 張預設玩法，讓第一次使用的店長不用自己想規則，一鍵建立。
 * 若同名規則已存在（不論啟用 / 停用），按鈕顯示「已套用」並停用避免重複。
 */

type Purpose = "回訪" | "曝光" | "拉新";

interface Preset {
  key: string;
  emoji: string;
  name: string;
  points: number;
  description: string;
  useCase: string;
  purpose: Purpose;
}

const PURPOSE_STYLE: Record<Purpose, string> = {
  回訪: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  曝光: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  拉新: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
};

const PRESETS: Preset[] = [
  {
    key: "visit",
    emoji: "♨️",
    name: "來店蒸足",
    points: 1,
    description: "完成一次蒸足體驗即可獲得點數",
    useCase: "每次來店就累積 +1，養成回訪習慣",
    purpose: "回訪",
  },
  {
    key: "share",
    emoji: "📸",
    name: "蒸足打卡",
    points: 3,
    description: "分享蒸足感受或打卡即可獲得點數",
    useCase: "鼓勵社群分享、自然曝光",
    purpose: "曝光",
  },
  {
    key: "referral",
    emoji: "🤝",
    name: "推薦朋友",
    points: 10,
    description: "朋友完成蒸足體驗後即可獲得點數",
    useCase: "最有效的拉新動作，鼓勵轉介紹",
    purpose: "拉新",
  },
];

interface Props {
  existingRuleNames: string[];
}

export function PresetPlaybookCards({ existingRuleNames }: Props) {
  const existing = new Set(existingRuleNames);

  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-earth-900">推薦玩法</h2>
        <p className="text-[12px] text-earth-500">
          三種最常見的集點情境 — 一鍵套用，就不用自己從零想
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PRESETS.map((p) => (
          <PresetCard key={p.key} preset={p} alreadyApplied={existing.has(p.name)} />
        ))}
      </div>
    </section>
  );
}

function PresetCard({ preset, alreadyApplied }: { preset: Preset; alreadyApplied: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleApply() {
    if (alreadyApplied) return;

    const fd = new FormData();
    fd.set("name", preset.name);
    fd.set("points", String(preset.points));
    fd.set("description", preset.description);

    startTransition(async () => {
      try {
        await createBonusRule(fd);
        toast.success(`已套用「${preset.name}」+${preset.points} 點 · 已加入下方規則列表`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "套用失敗");
      }
    });
  }

  return (
    <div className="flex flex-col rounded-[16px] border border-earth-200 bg-earth-50/40 p-4 transition hover:border-primary-200 hover:bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl">
            {preset.emoji}
          </span>
          <h3 className="text-sm font-semibold text-earth-900">{preset.name}</h3>
        </div>
        <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[12px] font-bold text-primary-700">
          +{preset.points} 點
        </span>
      </div>

      <span
        className={`mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${PURPOSE_STYLE[preset.purpose]}`}
      >
        # {preset.purpose}
      </span>

      <p className="mt-2 text-[12px] text-earth-600">{preset.useCase}</p>
      <p className="mt-1 text-[11px] text-earth-400">{preset.description}</p>

      <div className="mt-3 flex-1" />

      <button
        type="button"
        onClick={handleApply}
        disabled={alreadyApplied || pending}
        className={
          alreadyApplied
            ? "mt-2 h-10 rounded-[10px] border border-earth-200 bg-earth-100 text-[13px] font-medium text-earth-500"
            : "mt-2 h-10 rounded-[10px] bg-primary-600 text-[13px] font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
        }
      >
        {alreadyApplied ? "已套用" : pending ? "套用中…" : "一鍵套用"}
      </button>
    </div>
  );
}
