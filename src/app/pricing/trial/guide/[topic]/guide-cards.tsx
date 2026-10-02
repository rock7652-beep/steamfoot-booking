"use client";
import Image from "next/image";
import { useState } from "react";
import type { TrialGuide } from "@/lib/trial-guides";
export function GuideCards({ guide }: { guide: TrialGuide }) {
  const [index, setIndex] = useState(0);
  const step = guide.steps[index];
  return (
    <div className="mt-6">
      <div className="mb-4 flex gap-2" aria-label="教學進度">
        {guide.steps.map((_, i) => (
          <button
            key={i}
            aria-label={`步驟 ${i + 1}`}
            aria-current={i === index ? "step" : undefined}
            onClick={() => setIndex(i)}
            className={`h-2 min-w-10 flex-1 rounded-full ${i <= index ? "bg-[#315e49]" : "bg-[#d7dfd9]"}`}
          />
        ))}
      </div>
      <article className="rounded-2xl border border-[#ddd8ca] bg-white p-5 sm:p-7">
        <p className="text-sm text-[#967039]">
          步驟 {index + 1} / {guide.steps.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{step.title}</h2>
        <p className="mt-3 leading-relaxed">{step.text}</p>
        {step.image && (
          <>
            <div className="mt-5 overflow-x-auto rounded-lg border">
              <div className="relative min-w-[640px]">
                <Image
                  src={step.image}
                  alt={`LINE 官方操作畫面：${step.title}`}
                  width={1800}
                  height={1000}
                  unoptimized
                  className="h-auto w-full"
                />
                {step.highlight && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-md border-[3px] border-[#d46e25] bg-amber-300/10 shadow-[0_0_0_2px_white]"
                    style={{
                      left: `${step.highlight[0]}%`,
                      top: `${step.highlight[1]}%`,
                      width: `${step.highlight[2]}%`,
                      height: `${step.highlight[3]}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <a
              href={step.image}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-[#386650] underline"
            >
              放大查看完整畫面 ↗
            </a>
            <p className="mt-2 text-sm text-[#64736b]">
              橘框標示操作位置；小螢幕可左右滑動。圖片為 LINE
              官方手冊畫面，介面可能更新。
            </p>
          </>
        )}
        {step.link && (
          <a
            href={step.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex rounded-lg bg-[#315e49] px-5 py-3 font-medium text-white"
          >
            {step.linkLabel} ↗
          </a>
        )}
      </article>
      <div className="mt-5 flex justify-between gap-3">
        <button
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          className="rounded-lg border border-[#c9d2ca] px-5 py-3 disabled:opacity-30"
        >
          上一步
        </button>
        {index < guide.steps.length - 1 ? (
          <button
            onClick={() => setIndex(index + 1)}
            className="rounded-lg bg-[#315e49] px-5 py-3 text-white"
          >
            下一步 →
          </button>
        ) : (
          <p className="self-center font-medium text-[#315e49]">
            ✓ 切回原申請頁填寫
          </p>
        )}
      </div>
      {guide.source && (
        <a
          href={guide.source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block text-sm text-[#64736b] underline"
        >
          查看官方操作手冊 ↗
        </a>
      )}
    </div>
  );
}
