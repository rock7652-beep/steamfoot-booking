"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {ReminderSettingsList} from '@/components/admin/reminder-settings-list';

/** All sections stay mounted; disclosure changes preserve drafts. */
export function ReminderSectionPicker({ initial, sections }: {
  initial: string;
  sections: { key: string; label: string; content: ReactNode }[];
}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(initial&&initial!=='booking-reminders')Array.from(root.current?.querySelectorAll<HTMLElement>('[data-reminder-group]')??[]).find(section=>section.dataset.reminderGroup===initial)?.scrollIntoView({block:'start'});},[initial]);
  return <div ref={root} className="space-y-5">
    {sections.map(section => <section key={section.key} data-reminder-group={section.key} className="min-w-0 scroll-mt-4 space-y-2"><h2 className="font-semibold text-earth-900">{section.label}</h2><ReminderSettingsList>{section.content}</ReminderSettingsList></section>)}
  </div>;
}
