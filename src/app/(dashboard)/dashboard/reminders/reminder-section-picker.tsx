"use client";

import { useId, useState, type ReactNode } from "react";

/** Keep inactive forms mounted so changing categories preserves drafts. */
export function ReminderSectionPicker({ initial, sections }: {
  initial: string;
  sections: { key: string; label: string; content: ReactNode }[];
}) {
  const id = useId();
  const [selected, setSelected] = useState(initial);
  const active = sections.some(section => section.key === selected) ? selected : sections[0]?.key;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-sm font-medium text-earth-700">提醒類型</label>
      <select id={id} value={active} onChange={event => setSelected(event.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm">
        {sections.map(section => <option key={section.key} value={section.key}>{section.label}</option>)}
      </select>
    </div>
    {sections.map(section => <div key={section.key} hidden={section.key !== active} className="space-y-3">{section.content}</div>)}
  </div>;
}
