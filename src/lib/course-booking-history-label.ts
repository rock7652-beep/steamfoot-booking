export function courseBookingHistoryLabel(booking: {
  status: string; checkedIn: boolean; unit: string; absenceKind?: string | null;
  bookingKind?: string; separateMakeup?: boolean;
}) {
  if (booking.bookingKind === "OPENING_MAKEUP") return booking.status === "ATTENDED" ? "補課已完成／已核銷" : booking.status === "CANCELLED" ? "補課已取消／權益退回" : booking.checkedIn ? "補課已簽到／待確認出席" : "已安排補課／待出席";
  if (booking.absenceKind === "TEACHER_ABSENT") return "教師未授課／不扣堂";
  if (booking.absenceKind === "STUDENT_LEAVE") return booking.separateMakeup ? "請假／已扣堂，另給補課" : "請假／保留原方案堂數";
  if (booking.absenceKind === "GROUP_LEAVE_FORFEITED") return "請假／已扣堂，不補課";
  if (booking.unit === "TRIAL") return ({ ATTENDED: "體驗已出席", CANCELLED: "體驗已取消", NO_SHOW: "體驗未到", RESERVED: booking.checkedIn ? "體驗已簽到／待出席" : "體驗待出席" } as Record<string, string>)[booking.status] ?? booking.status;
  return booking.status === "ATTENDED" ? "已出席／已扣額度" : booking.status === "NO_SHOW" ? "曠課／已扣額度" : booking.status === "CANCELLED" ? "已取消／未占用額度" : booking.checkedIn ? "已簽到／待確認出席" : "已預約／待出席";
}
