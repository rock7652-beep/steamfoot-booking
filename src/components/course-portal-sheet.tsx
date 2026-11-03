"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
export function CoursePortalSheet({
  title,
  close,
  children,
  footer,
  busy,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  footer: ReactNode;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () =>
      setViewport({ height: view.height, top: view.offsetTop });
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
    };
  }, []);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const y = scrollY,
      active = document.activeElement as HTMLElement | null;
    const body = document.body,
      old = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        overflow: body.style.overflow,
      };
    Object.assign(body.style, {
      position: "fixed",
      top: `-${y}px`,
      width: "100%",
      overflow: "hidden",
    });
    ref.current?.focus();
    return () => {
      Object.assign(body.style, old);
      window.scrollTo(0, y);
      active?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="cp-overlay"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height, bottom: "auto" }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) closeRef.current();
        if (e.key === "Tab") {
          const a = [
            ...ref.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            ),
          ];
          if (e.shiftKey && document.activeElement === a[0]) {
            e.preventDefault();
            a.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
            e.preventDefault();
            a[0]?.focus();
          }
        }
      }}
    >
      <div className="cp-backdrop" onClick={() => !busy && close()} />
      <div
        ref={ref}
        className="cp-sheet"
        style={
          viewport
            ? { maxHeight: Math.max(0, viewport.height - 12) }
            : undefined
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button disabled={busy} onClick={close} aria-label="關閉">
            ×
          </button>
        </header>
        <div className="cp-sheet-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
