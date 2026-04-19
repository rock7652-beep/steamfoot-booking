"use client";

import { useState, useEffect } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { APP_VERSION, getLatestChangelog } from "@/lib/version";
import type { ChangelogTag } from "@/lib/version";

const TAG_COLORS: Record<ChangelogTag, string> = {
  "新功能": "bg-blue-100 text-blue-700",
  "修正": "bg-red-100 text-red-600",
  "優化": "bg-green-100 text-green-700",
};

const DISMISS_KEY = "dismissed_version";

export default function UpdateBanner() {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored !== APP_VERSION) {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const latest = getLatestChangelog();
  // Collect unique tags from latest changes
  const tags = [...new Set(latest.changes.map((c) => c.tag))];

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, APP_VERSION);
    setDismissed(true);
  }

  return (
    <div className="relative rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 text-primary-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-primary-900">v{latest.version} 更新</span>
            {tags.map((tag) => (
              <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_COLORS[tag]}`}>
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-0.5 text-xs text-primary-700">{latest.highlights}</p>
          <Link
            href="/dashboard/changelog"
            className="mt-1 inline-block text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
          >
            查看完整更新日誌 →
          </Link>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
          aria-label="關閉更新通知"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
