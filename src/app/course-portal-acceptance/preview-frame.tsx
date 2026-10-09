"use client";

import { useState } from "react";

const sizes = [
  { label: "手機 360", width: 360, height: 800 },
  { label: "手機 390", width: 390, height: 844 },
  { label: "平板直向", width: 768, height: 1024 },
  { label: "平板橫向", width: 1024, height: 768 },
  { label: "桌機 1366", width: 1366, height: 900 },
] as const;

export function CoursePortalAcceptanceFrame({ src }: { src: string }) {
  const [index, setIndex] = useState(0);
  const size = sizes[index];
  return <main className="min-h-dvh bg-earth-50 p-3">
    <h1 className="text-lg font-semibold">顧客前台尺寸驗收</h1>
    <p className="my-2 text-sm">隔離測試・唯讀・不會儲存；切換尺寸保留目前畫面。</p>
    <div role="group" aria-label="驗收尺寸" className="mb-3 flex flex-wrap gap-2">
      {sizes.map((item, i) => <button key={item.width} type="button" aria-pressed={i === index} onClick={() => setIndex(i)} className="min-h-11 rounded border border-earth-300 bg-white px-3 text-sm">{item.label}</button>)}
    </div>
    <p role="status" className="mb-2 text-sm">{size.width} × {size.height}</p>
    <section className="max-w-full overflow-x-auto" aria-label="前台驗收畫面">
      <iframe title="顧客前台尺寸驗收" src={src} width={size.width} height={size.height} sandbox="allow-scripts allow-same-origin" className="block border-0 bg-white" style={{ width: size.width, height: size.height, maxWidth: "none" }} />
    </section>
  </main>;
}
