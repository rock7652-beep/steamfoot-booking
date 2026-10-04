"use client";
import { useState } from "react";

export function ReviewViewport({ src, initialWidth }: { src: string; initialWidth: number }) {
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(900);
  return <>
    <div className="my-3 flex flex-wrap items-center gap-2" aria-label="驗收尺寸">
      {[360, 390, 768, 1024, 1366, 1920].map(value => <button key={value} type="button" aria-pressed={width === value} onClick={() => setWidth(value)} className="min-h-11 rounded border px-3">{value}px</button>)}
      <label>預覽高度 <select aria-label="預覽高度" value={height} onChange={event => setHeight(Number(event.target.value))} className="min-h-11 rounded border px-2">{[400, 768, 844, 900, 1024].map(value => <option key={value} value={value}>{value}px</option>)}</select></label>
    </div>
    <p role="status">{width} × {height}；調整尺寸保留同一個預覽與編輯狀態。</p>
    <div className="overflow-x-auto"><iframe title="課表驗收" src={src} style={{ width, height }} className="box-content border border-earth-300" /></div>
  </>;
}
