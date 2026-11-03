'use client';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import type { SignatureStrokes } from '@/lib/course-agreement-signing';
export function SignaturePad({ value, onChange, disabled = false }: { value: SignatureStrokes; onChange: (value: SignatureStrokes) => void; disabled?: boolean }) {
  const strokes = useRef(value), pointer = useRef<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [cursor, setCursor] = useState({ x: .5, y: .5 });
  const hintId = useId();
  useEffect(() => { strokes.current = value; }, [value]);
  const change = (next: SignatureStrokes) => { strokes.current = next; onChange(next); };
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  return <div className="min-w-0 space-y-2">
    <p id={hintId} className="text-sm text-earth-600">用手指、觸控筆或滑鼠簽名。鍵盤操作：空白鍵開始／結束一筆，方向鍵移動。</p>
    <svg role="application" aria-label="手寫簽名區" aria-describedby={hintId} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      viewBox="0 0 1000 300" preserveAspectRatio="none" className="block aspect-[10/3] w-full rounded-lg border border-earth-300 bg-white focus:outline-2 focus:outline-primary-700" style={{ touchAction: 'none' }}
      onPointerDown={event => {
        if (disabled || pointer.current !== null || keyboard || strokes.current.length >= 100 || strokes.current.flat().length >= 1999 || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
        const p = point(event); change([...strokes.current, [p, p]]);
      }}
      onPointerMove={event => {
        if (disabled || pointer.current !== event.pointerId || strokes.current.flat().length >= 2000) return;
        const p = point(event), last = strokes.current.at(-1);
        if (!last || Math.hypot(p.x - last.at(-1)!.x, p.y - last.at(-1)!.y) < .002) return;
        change([...strokes.current.slice(0, -1), [...last, p]]);
      }}
      onPointerUp={event => { if (pointer.current === event.pointerId) pointer.current = null; }}
      onPointerCancel={() => { pointer.current = null; }}
      onKeyDown={event => {
        if (disabled || pointer.current !== null) return;
        if (event.key === ' ') {
          event.preventDefault(); if (!keyboard && strokes.current.length < 100 && strokes.current.flat().length < 1999) change([...strokes.current, [cursor, cursor]]);
          setKeyboard(!keyboard); return;
        }
        const direction = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.03], ArrowDown: [0, .03] }[event.key];
        if (!direction) return; event.preventDefault();
        const p = { x: Math.max(0, Math.min(1, cursor.x + direction[0])), y: Math.max(0, Math.min(1, cursor.y + direction[1])) };
        setCursor(p);
        if (keyboard && strokes.current.length && strokes.current.flat().length < 2000) change([...strokes.current.slice(0, -1), [...strokes.current.at(-1)!, p]]);
      }} onBlur={() => setKeyboard(false)}>
      {value.map((stroke, index) => <polyline key={index} points={stroke.map(p => `${p.x * 1000},${p.y * 300}`).join(' ')} fill="none" stroke="#234139" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      {keyboard && <circle cx={cursor.x * 1000} cy={cursor.y * 300} r="5" fill="#b45309" />}
    </svg>
    <button type="button" disabled={disabled} className="min-h-11 rounded-lg border border-earth-200 px-4 text-sm text-primary-800 disabled:opacity-50" onClick={() => { pointer.current = null; setKeyboard(false); change([]); }}>清除重簽</button>
  </div>;
}
