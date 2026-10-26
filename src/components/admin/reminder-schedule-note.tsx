import { NEXT_DAY_REMINDER_SCHEDULE } from '@/lib/reminder-schedule';

/** Schedule policy only; module settings remain authoritative for enablement. */
export function ReminderScheduleNote({note}: {note?: string}) {
  return <div className="min-w-0 text-sm text-earth-600">
    <p>{NEXT_DAY_REMINDER_SCHEDULE}</p>
    <p>{note ?? '依本店已開啟的通知項目發送；預約異動通知另行處理。'}</p>
  </div>;
}
