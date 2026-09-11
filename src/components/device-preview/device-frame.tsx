"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DevicePresetId } from "@/lib/device-preview";
import { DEVICE_PRESETS } from "@/lib/device-preview";

interface DeviceFrameProps {
  device: DevicePresetId;
  src: string;
  refreshKey: number;
}

type FrameState = "loading" | "ready" | "error" | "session-expired";

export function DeviceFrame({ device, src, refreshKey }: DeviceFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [frameState, setFrameState] = useState<FrameState>("loading");
  const preset = DEVICE_PRESETS[device];
  const scale = availableWidth > 0 ? Math.min(1, availableWidth / preset.width) : 1;
  const scaledWidth = Math.round(preset.width * scale);
  const scaledHeight = Math.round(preset.height * scale);

  const updateAvailableWidth = useCallback(() => {
    if (containerRef.current) setAvailableWidth(containerRef.current.clientWidth);
  }, []);

  useLayoutEffect(() => {
    updateAvailableWidth();
    const observer = new ResizeObserver(updateAvailableWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateAvailableWidth]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFrameState((current) => (current === "loading" ? "error" : current));
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleLoad = () => {
    try {
      const loadedPath = iframeRef.current?.contentWindow?.location.pathname;
      if (loadedPath?.includes("/login")) {
        setFrameState("session-expired");
        return;
      }
    } catch {
      // The preview is same-origin in production. Keep a successfully loaded
      // frame usable if a browser privacy setting prevents path inspection.
    }
    setFrameState("ready");
  };

  const loadingLabel = `正在載入${preset.label}版預覽…`;

  return (
    <div className="min-w-0 rounded-xl border border-earth-200 bg-earth-50 p-2 shadow-sm sm:p-4">
      <div ref={containerRef} className="relative min-w-0 overflow-hidden rounded-lg">
        <div
          className="relative mx-auto overflow-hidden rounded-lg border border-earth-300 bg-white shadow-lg"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <iframe
            key={`${src}-${refreshKey}`}
            ref={iframeRef}
            src={src}
            title={`${preset.label}版預覽`}
            width={preset.width}
            height={preset.height}
            onLoad={handleLoad}
            className="absolute left-0 top-0 block border-0 bg-white"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />

          {frameState !== "ready" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-5 text-center">
              {frameState === "session-expired" ? (
                <p className="max-w-sm text-sm font-medium text-earth-700">登入狀態已失效，請重新登入蒸管家。</p>
              ) : frameState === "error" ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-earth-700">預覽載入失敗</p>
                  <p className="text-xs text-earth-500">請使用上方「重新整理」再試一次。</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-earth-600">{loadingLabel}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
