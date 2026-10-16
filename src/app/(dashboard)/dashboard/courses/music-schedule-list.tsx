"use client";

import { RosterTable } from "@/components/admin/roster-table";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { courseSessionStatus } from "@/lib/course-session-status";
import { scheduleRosterBookings } from "@/lib/course-schedule-counts";

type Row = {
  id: string; nameSnapshot: string; startsAt: string; endsAt: string;
  coachId: string; roomId: string; previewKind?: string;
  bookings: { status: string; customerId: string | null; customerName: string; bookingKind: string; absenceKind?: string | null }[];
};
export function MusicScheduleList({ sessions, coaches, rooms, nowIso, canCreate, canEdit, onOpen, onEdit, onBook, onTrial, onCopy }: {
  sessions: Row[]; coaches: { id: string; displayName: string }[]; rooms: { id: string; name: string }[];
  nowIso: string; canCreate: boolean; canEdit: boolean;
  onOpen: (id: string) => void; onEdit: (id: string) => void; onBook: (id: string) => void;
  onTrial?: (id: string) => void; onCopy?: (id: string) => void;
}) {
  return <div className="min-w-0 [&_table]:min-w-[1000px]">
    <RosterTable label="課表清單" dense widths={["12%","13%","20%","12%","12%","9%","14%","8%"]} columns={["日期","時間","課程","教師","教室","人數","狀態","操作"]}>
      {sessions.map(row => {
        const state = courseSessionStatus(row, nowIso);
        const rental = row.previewKind === "RENTAL";
        return <tr key={row.id}>
          <td className="tabular-nums">{toLocalDateStr(new Date(row.startsAt))}</td>
          <td className="tabular-nums">{formatTWDateTime(new Date(row.startsAt)).slice(11,16)}–{toLocalDateStr(new Date(row.endsAt)) !== toLocalDateStr(new Date(row.startsAt)) ? "翌日 " : ""}{formatTWDateTime(new Date(row.endsAt)).slice(11,16)}</td>
          <td><button className="min-h-11 text-left font-medium text-primary-800 hover:underline" onClick={() => onOpen(row.id)}>{row.nameSnapshot}</button></td>
          <td>{rental ? "—" : coaches.find(item => item.id === row.coachId)?.displayName ?? "未指定"}</td>
          <td>{rooms.find(item => item.id === row.roomId)?.name ?? "未指定"}</td>
          <td className="tabular-nums">{rental ? "—" : scheduleRosterBookings(row.bookings).length}</td>
          <td><span className={`rounded px-2 py-1 ${state.badgeClass}`}>{state.label}</span></td>
          <td><ExclusiveMenu label={`${row.nameSnapshot} ${formatTWDateTime(new Date(row.startsAt))} 更多操作`} triggerText="⋯">
            <button className="min-h-11 w-full px-3 text-left text-sm" onClick={() => onOpen(row.id)}>{rental ? "租借資訊" : "名單／點名"}</button>
            {canCreate && !rental && <button className="min-h-11 w-full px-3 text-left text-sm" onClick={() => onBook(row.id)}>新增預約</button>}
            {canCreate && !rental && onTrial && <button className="min-h-11 w-full px-3 text-left text-sm" onClick={() => onTrial(row.id)}>體驗預約</button>}
            {canEdit && !rental && <button className="min-h-11 w-full px-3 text-left text-sm" onClick={() => onEdit(row.id)}>編輯排課</button>}
            {canCreate && !rental && onCopy && <button className="min-h-11 w-full px-3 text-left text-sm" onClick={() => onCopy(row.id)}>複製排課</button>}
          </ExclusiveMenu></td>
        </tr>;
      })}
      {!sessions.length && <tr><td colSpan={8}>沒有符合條件的課程</td></tr>}
    </RosterTable>
  </div>;
}
