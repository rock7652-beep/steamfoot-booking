"use client";

import { useId, useState } from "react";

/** Optional display name; the existing action still receives a complete name. */
export function SportsSessionNameField({ defaultName, originalTemplateName, templateName }: {
  defaultName: string;
  originalTemplateName: string;
  templateName: string;
}) {
  const id = useId();
  const [customName, setCustomName] = useState(defaultName === originalTemplateName ? "" : defaultName);
  return <>
    <input type="hidden" name="name" value={customName.trim() || templateName} />
    <details className="col-span-full min-w-0 self-end">
      <summary className="min-h-11 cursor-pointer break-words text-sm text-primary-700">
        {customName.trim() ? `自訂課名：${customName.trim()}` : "自訂課名（選填）"}
      </summary>
      <label htmlFor={id} className="block text-sm">
        自訂課名（選填）
        <input id={id} name="customName" maxLength={80} value={customName}
          onChange={event => setCustomName(event.target.value)}
          placeholder={templateName}
          className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base" />
      </label>
      <p className="mt-1 text-sm text-earth-500">留空沿用教學項目名稱。</p>
    </details>
  </>;
}
