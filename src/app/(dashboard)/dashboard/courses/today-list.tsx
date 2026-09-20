"use client";
import { useState } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { CourseRoster } from "./roster";
import { formatTWDateTime } from "@/lib/date-utils";
type Row = {
  id: string;
  nameSnapshot: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  coach: string;
  room: string;
  booked: number;
  customerIds: string[];
  unmarked: number;
};
export function CourseTodayList({
  sessions,
  canCreate,
  canEdit,
}: {
  sessions: Row[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === selected);
  return (
    <>
      <p className="border-b px-4 py-3 text-sm">
        今日 {sessions.length} 堂課 · 共 {new Set(sessions.flatMap((s) => s.customerIds)).size} 人 · 參與{" "}
        {sessions.reduce((n, s) => n + s.booked, 0)} 人次 · 未完成{" "}
        {sessions.reduce((n, s) => n + s.unmarked, 0)} 人次
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-earth-50">
            <tr>
              {["時間", "課程", "教練", "教室", "已預約／上限", "名單與出席"].map((h) => (
                <th className="whitespace-nowrap px-4 py-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatTWDateTime(new Date(s.startsAt)).slice(11)}–
                  {formatTWDateTime(new Date(s.endsAt)).slice(11)}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="min-h-11 text-primary-700 underline"
                    onClick={() => setSelected(s.id)}
                  >
                    {s.nameSnapshot}
                  </button>
                </td>
                <td className="px-4 py-3">{s.coach}</td>
                <td className="px-4 py-3">{s.room}</td>
                <td className="px-4 py-3">
                  {s.booked}／{s.capacity}
                </td>
                <td className="px-4 py-2"><button className="min-h-11 rounded-lg border border-primary-200 px-3 text-primary-800" onClick={() => setSelected(s.id)}>名單{ s.unmarked > 0 ? ` · ${s.unmarked} 位待出席` : "／查看"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sessions.length && (
          <p className="p-4 text-sm text-earth-500">今天尚未安排課程。先新增排課，再從課程名單替學員預約。</p>
        )}
      </div>
      {session && (
        <RightSheet
          compact
          open
          onClose={() => setSelected(null)}
          labelledById="today-course-title"
        >
          <header className="flex shrink-0 items-center justify-between border-b p-4">
            <h2 id="today-course-title">{session.nameSnapshot}</h2>
            <button className="min-h-11 px-3" onClick={() => setSelected(null)}>
              關閉
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <CourseRoster
              key={session.id}
              sessionId={session.id}
              capacity={session.capacity}
              canCreate={canCreate}
              canEdit={canEdit}
            />
          </div>
        </RightSheet>
      )}
    </>
  );
}
