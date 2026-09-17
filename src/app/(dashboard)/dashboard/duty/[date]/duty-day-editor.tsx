"use client";

import { useState, useTransition } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  DUTY_ROLE_LABELS,
  PARTICIPATION_TYPE_LABELS,
  DUTY_ROLES,
  PARTICIPATION_TYPES,
  DEFAULT_DUTY_ROLE_MAP,
} from "@/lib/duty-constants";
import type { DutyRole, ParticipationType, UserRole } from "@prisma/client";
import {
  upsertDutyAssignment,
  deleteDutyAssignment,
  copySlotToAllSlots,
  copyFromPreviousBusinessDay,
  copyToWeekDates,
} from "@/server/actions/duty";

interface AssignmentInfo {
  id: string;
  slotTime: string;
  staffId: string;
  staffName: string;
  staffColor: string;
  dutyRole: DutyRole;
  participationType: ParticipationType;
  notes: string | null;
}

interface StaffOption {
  id: string;
  displayName: string;
  colorCode: string;
  userRole: string;
}

interface WeekDayInfo {
  date: string;
  isBusinessDay: boolean;
  existingCount: number;
}

interface Props {
  date: string;
  isClosed: boolean;
  closedReason: string;
  slots: string[];
  assignments: AssignmentInfo[];
  staffList: StaffOption[];
  canManage: boolean;
  weekDayInfo: WeekDayInfo[];
  preferredStaffId?: string;
  course?: boolean;
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();
  return `${dateStr}（週${DAY_LABELS[dow]}）`;
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();
  return `${parseInt(m)}/${parseInt(d)}(${DAY_LABELS[dow]})`;
}

export function DutyDayEditor({
  date,
  isClosed,
  closedReason,
  slots,
  assignments,
  staffList,
  canManage,
  weekDayInfo,
  preferredStaffId,
  course = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingSlot, setAddingSlot] = useState<string | null>(null);
  const [showCopyToWeek, setShowCopyToWeek] = useState(false);
  const [selectedWeekDates, setSelectedWeekDates] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [confirmation, setConfirmation] = useState<{ text: string; run: () => void } | null>(null);

  // 新增人員表單
  const [formStaffId, setFormStaffId] = useState(preferredStaffId ?? "");
  const [formDutyRole, setFormDutyRole] = useState<DutyRole>("STORE_MANAGER");
  const [formParticipation, setFormParticipation] = useState<ParticipationType>("PRIMARY");
  const [formNotes, setFormNotes] = useState("");

  const roleLabels = course ? {...DUTY_ROLE_LABELS, INTERN_COACH: "教練"} : DUTY_ROLE_LABELS;

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    if (type === "success") setTimeout(() => setMessage(null), 3000);
  }

  function handleStaffChange(staffId: string) {
    setFormStaffId(staffId);
    // 自動帶入 DutyRole
    const staff = staffList.find((s) => s.id === staffId);
    if (staff) {
      const defaultRole = course && staff.userRole === "CUSTOMER" ? "INTERN_COACH" : DEFAULT_DUTY_ROLE_MAP[staff.userRole as UserRole];
      if (defaultRole) setFormDutyRole(defaultRole);
    }
  }

  function startAdd(slotTime: string) {
    setAddingSlot(slotTime);
    setFormStaffId(preferredStaffId ?? "");
    setFormDutyRole("STORE_MANAGER");
    setFormParticipation("PRIMARY");
    setFormNotes("");
  }

  async function handleSave() {
    if (!formStaffId || !addingSlot) return;
    startTransition(async () => {
      const result = await upsertDutyAssignment({
        date,
        slotTime: addingSlot,
        staffId: formStaffId,
        dutyRole: formDutyRole,
        participationType: formParticipation,
        notes: formNotes || undefined,
      });
      if (result.success) {
        setAddingSlot(null);
        showMessage("success", "已新增值班安排");
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  async function handleDelete(id: string, staffName: string, confirmed = false) {
    const text = `確定移除 ${staffName} 的值班安排？`;
    if (!confirmed) {
      if (course) { setConfirmation({text, run: () => { void handleDelete(id, staffName, true); }}); return; }
      if (!confirm(text)) return;
    }
    startTransition(async () => {
      const result = await deleteDutyAssignment(id);
      if (result.success) {
        showMessage("success", "已移除");
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  async function handleCopyToAllSlots(slotTime: string, confirmed = false) {
    const slotAssignments = assignments.filter((a) => a.slotTime === slotTime);
    const otherSlotCount = slots.filter((s) => s !== slotTime).length;
    const text = `將 ${slotTime} 的值班安排（${slotAssignments.length} 人）複製到該日其他 ${otherSlotCount} 個時段，已有安排的時段不會被覆蓋。確定？`;
    if (!confirmed) {
      if (course) { setConfirmation({text, run: () => { void handleCopyToAllSlots(slotTime, true); }}); return; }
      if (!confirm(text)) return;
    }

    startTransition(async () => {
      const result = await copySlotToAllSlots({ date, sourceSlotTime: slotTime });
      if (result.success) {
        showMessage("success", `已複製 ${result.data.copiedCount} 筆安排到其他時段`);
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  async function handleCopyFromPrevious() {
    startTransition(async () => {
      // 先呼叫 action，它會自己找前一個營業日
      const result = await copyFromPreviousBusinessDay({ targetDate: date });
      if (result.success) {
        showMessage("success", `已從 ${result.data.sourceDate} 複製 ${result.data.copiedCount} 筆安排`);
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  async function handleCopyToWeekDates(confirmed = false) {
    if (selectedWeekDates.length === 0) return;

    // 檢查是否有已存在安排的目標日
    const datesWithExisting = selectedWeekDates.filter((d) => {
      const info = weekDayInfo.find((w) => w.date === d);
      return info && info.existingCount > 0;
    });

    const text = datesWithExisting.length
      ? `${datesWithExisting.map(d => `${formatDateShort(d)} 已有 ${weekDayInfo.find(w => w.date === d)!.existingCount} 筆值班安排`).join("、")}，複製後將全部覆蓋。確定？`
      : `將今天的值班安排複製到 ${selectedWeekDates.map(formatDateShort).join("、")}，確定？`;
    if (!confirmed) {
      if (course) { setConfirmation({text, run: () => { void handleCopyToWeekDates(true); }}); return; }
      if (!confirm(text)) return;
    }

    startTransition(async () => {
      const result = await copyToWeekDates({
        sourceDate: date,
        targetDates: selectedWeekDates,
      });
      if (result.success) {
        showMessage("success", `已複製 ${result.data.copiedCount} 筆安排`);
        setShowCopyToWeek(false);
        setSelectedWeekDates([]);
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  const hasAnyAssignment = assignments.length > 0;

  return (
    <div>
      {course && <RightSheet open={!!confirmation} onClose={() => setConfirmation(null)} labelledById="duty-confirm-title">
        <h2 id="duty-confirm-title" className="border-b p-4 text-lg font-semibold">確認值班調整</h2>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          <p>{confirmation?.text}</p>
          <p className="mt-3 text-earth-600">若影響既有課程的完整值班涵蓋，本批將阻擋並列出衝突，不取消課程或學員預約。</p>
        </div>
        <div className="flex gap-3 border-t p-4">
          <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => setConfirmation(null)}>返回修改</button>
          <button type="button" className="min-h-11 rounded-lg bg-primary-700 px-4 text-white" disabled={isPending} onClick={() => { const run = confirmation?.run; setConfirmation(null); run?.(); }}>確認調整</button>
        </div>
      </RightSheet>}
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-earth-500">
        <Link href="/dashboard/duty" className="hover:text-earth-700">值班安排</Link>
        <span>/</span>
        <span className="text-earth-700">{formatDate(date)}</span>
      </div>

      {/* 訊息提示 */}
      {message && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
          message.type === "success"
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {isClosed ? (
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-earth-500">{closedReason} — 無法安排值班</p>
        </div>
      ) : (
        <>
          {/* 頂部工具列 */}
          {canManage && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={handleCopyFromPrevious}
                disabled={isPending || hasAnyAssignment}
                className="rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={hasAnyAssignment ? "今天已有值班安排，請手動調整" : "從前一個營業日複製"}
              >
                從前一天複製
              </button>
              <button
                onClick={() => {
                  setShowCopyToWeek(!showCopyToWeek);
                  setSelectedWeekDates([]);
                }}
                disabled={isPending || !hasAnyAssignment}
                className="rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                複製到本週其他日期
              </button>
            </div>
          )}

          {/* 複製到本週面板 */}
          {showCopyToWeek && (
            <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
              <p className="mb-3 text-sm font-medium text-earth-800">選擇要複製到的日期：</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {weekDayInfo.map((wd) => {
                  const isSource = wd.date === date;
                  const disabled = isSource || !wd.isBusinessDay;
                  const checked = selectedWeekDates.includes(wd.date);

                  return (
                    <label
                      key={wd.date}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                        disabled
                          ? "cursor-not-allowed border-earth-200 bg-earth-100 text-earth-400"
                          : checked
                          ? "cursor-pointer border-primary-400 bg-primary-100 text-primary-800"
                          : "cursor-pointer border-earth-200 bg-white text-earth-700 hover:border-primary-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWeekDates([...selectedWeekDates, wd.date]);
                          } else {
                            setSelectedWeekDates(selectedWeekDates.filter((d) => d !== wd.date));
                          }
                        }}
                        className="sr-only"
                      />
                      <span>{formatDateShort(wd.date)}</span>
                      {isSource && <span className="text-[10px] text-earth-400">(來源)</span>}
                      {!wd.isBusinessDay && <span className="text-[10px]">公休</span>}
                      {wd.isBusinessDay && wd.existingCount > 0 && !isSource && (
                        <span className="text-[10px] text-amber-600">({wd.existingCount}筆)</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyToWeekDates()}
                  disabled={isPending || selectedWeekDates.length === 0}
                  className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  確認複製
                </button>
                <button
                  onClick={() => { setShowCopyToWeek(false); setSelectedWeekDates([]); }}
                  className="rounded-lg border border-earth-200 px-4 py-1.5 text-xs text-earth-600 hover:bg-earth-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 時段卡片列表 */}
          <div className="space-y-3">
            {slots.map((slotTime) => {
              const slotAssignments = assignments.filter((a) => a.slotTime === slotTime);

              return (
                <div
                  key={slotTime}
                  className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-earth-800">{slotTime}</h3>
                    {canManage && slotAssignments.length > 0 && (
                      <button
                        onClick={() => handleCopyToAllSlots(slotTime)}
                        disabled={isPending}
                        className="text-[10px] text-primary-600 hover:text-primary-800 disabled:opacity-50"
                      >
                        複製到整天
                      </button>
                    )}
                  </div>

                  {/* 已安排人員 */}
                  {slotAssignments.length > 0 ? (
                    <div className="space-y-2">
                      {slotAssignments.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-lg px-3 py-2"
                          style={{
                            backgroundColor: a.staffColor + "10",
                            borderLeft: `3px solid ${a.staffColor}`,
                          }}
                        >
                          <div>
                            <div className="text-sm font-medium text-earth-800">{a.staffName}</div>
                            <div className="text-xs text-earth-500">
                              身份：{roleLabels[a.dutyRole]}　參與：{PARTICIPATION_TYPE_LABELS[a.participationType]}
                            </div>
                            {a.notes && (
                              <div className="mt-0.5 text-xs text-earth-400">{a.notes}</div>
                            )}
                          </div>
                          {canManage && (
                            <button
                              onClick={() => handleDelete(a.id, a.staffName)}
                              disabled={isPending}
                              className="rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-red-500 disabled:opacity-50"
                              title="移除"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-earth-400">尚無值班人員</p>
                  )}

                  {/* 新增人員表單 */}
                  {canManage && addingSlot === slotTime ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-earth-200 bg-earth-50 p-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-earth-600">人員</label>
                        <select
                          value={formStaffId}
                          onChange={(e) => handleStaffChange(e.target.value)}
                          className="w-full rounded-lg border border-earth-200 px-3 py-1.5 text-sm"
                        >
                          <option value="">選擇人員...</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id}>{s.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-earth-600">值班身份</label>
                          <select
                            value={formDutyRole}
                            onChange={(e) => setFormDutyRole(e.target.value as DutyRole)}
                            className="w-full rounded-lg border border-earth-200 px-3 py-1.5 text-sm"
                          >
                            {DUTY_ROLES.map((r) => (
                              <option key={r} value={r}>{roleLabels[r]}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-earth-600">參與方式</label>
                          <select
                            value={formParticipation}
                            onChange={(e) => setFormParticipation(e.target.value as ParticipationType)}
                            className="w-full rounded-lg border border-earth-200 px-3 py-1.5 text-sm"
                          >
                            {PARTICIPATION_TYPES.map((p) => (
                              <option key={p} value={p}>{PARTICIPATION_TYPE_LABELS[p]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-earth-600">備註（選填）</label>
                        <input
                          type="text"
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          maxLength={200}
                          className="w-full rounded-lg border border-earth-200 px-3 py-1.5 text-sm"
                          placeholder="例如：帶新人觀摩第三堂"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSave}
                          disabled={isPending || !formStaffId}
                          className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setAddingSlot(null)}
                          className="rounded-lg border border-earth-200 px-4 py-1.5 text-xs text-earth-600 hover:bg-earth-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : canManage ? (
                    <button
                      onClick={() => startAdd(slotTime)}
                      disabled={isPending}
                      className="mt-2 text-xs text-primary-600 hover:text-primary-800 disabled:opacity-50"
                    >
                      + 新增人員
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
