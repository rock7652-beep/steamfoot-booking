"use client";

import { Component, type ReactNode } from "react";

const frame = "flex h-full items-center justify-center p-4 text-sm text-earth-500";

export function TrendChartLoading() {
  return <div role="status" className={frame}>趨勢圖讀取中…</div>;
}

/** Keep report data and controls usable if an optional plot cannot load. */
export class TrendChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div role="alert" className={frame}>趨勢圖暫時無法載入。完成目前工作後，請重新整理頁面再試。</div>
      : this.props.children;
  }
}
