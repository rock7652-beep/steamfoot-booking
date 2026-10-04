import { notFound } from "next/navigation";
import { ReviewViewport } from "./review-viewport";
import { BookingReview } from "./booking-review";
import DashboardShell from "@/components/sidebar";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";
import { SpaScheduleWorkspace } from "@/app/(dashboard)/dashboard/spa-schedule/workspace";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import "../../spa-admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "課表 RWD 驗收", robots: { index: false, follow: false } };

export default async function ScheduleReviewPage({ searchParams }: { searchParams: Promise<{ frame?: string; width?: string; module?: string; date?: string; scheduleView?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const reviewModule = query.module === "steamfoot" ? "steamfoot" : query.module === "music" ? "music" : query.module === "spa" ? "spa" : "fitness";
  const industryModule = reviewModule === "spa" ? "spa" : reviewModule === "steamfoot" ? "steamfoot" : "course";
  const widths = [360, 390, 768, 1024, 1366, 1920];
  const width = widths.find(value => String(value) === query.width) ?? 390;
  const date = query.date && parseTaipeiDateTime(query.date, "00:00") ? query.date : "2026-10-01";
  if (query.frame === "1") {
    const rooms = Array.from({length: 4}, (_, i) => ({id: `rwd-room-${i}`, name: `驗收 ${i + 1} 號教室・長名稱測試`, category: "", isActive: true, capacity: 15}));
    const coaches = Array.from({length: 4}, (_, i) => ({id: `rwd-coach-${i}`, displayName: `驗收老師 ${i + 1}・長名稱`, phone: "", status: "ACTIVE", courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: ["rwd-template"]}));
    const templates = [{...rooms[0], id: "rwd-template", name: "驗收團體課程・核心訓練與吉他合奏長名稱", classType: "GROUP", durationMinutes: 60, pointCost: 2, capacity: 15, defaultRoomId: rooms[0].id}];
    const sessions = Array.from({length: 12}, (_, i) => {
      const sessionDate = `2026-10-${String(1 + Math.floor(i / 4)).padStart(2, "0")}`;
      const hour = String(9 + (i % 4) * 2).padStart(2, "0");
      return {id: `rwd-session-${i}`, templateId: "rwd-template", nameSnapshot: templates[0].name, startsAt: parseTaipeiDateTime(sessionDate, `${hour}:00`)!.toISOString(), endsAt: parseTaipeiDateTime(sessionDate, `${String(Number(hour) + 1).padStart(2, "0")}:00`)!.toISOString(), coachId: coaches[i % 4].id, roomId: rooms[i % 4].id, capacity: 15, pointCost: 2, bookings: Array.from({length: 12}, (_, j) => ({id: `rwd-booking-${i}-${j}`, customerId: null, customerName: `驗收學員 ${j + 1} 長姓名`, status: "CONFIRMED", bookingKind: "REGULAR"}))};
    });
    return <DashboardShell industryModule={industryModule} industryModuleId={industryModule} isOwner operationGuidePreview permissions={["booking.read"]} pricingPlan="EXPERIENCE" userName="RWD 驗收使用者" roleLabel="系統管理者" logoutButton={null} storeName="虛擬驗收店家">
      <p className="mb-3 text-sm text-earth-500">虛擬資料，僅驗收排版與篩選；可開啟面板檢查排版；不送出新增、名單或儲存操作。</p>
      {reviewModule === "steamfoot" ? <BookingReview /> : reviewModule === "spa" ? <SpaScheduleWorkspace date={date} bookings={[]} staff={coaches.map(c => ({id: c.id, name: c.displayName}))} customers={[]} treatments={[{id:"rwd-treatment",name:"驗收服務",price:500,serviceMinutes:60,bufferMinutes:15,locationIds:rooms.map(r=>r.id)}]} locations={rooms.map(r=>({id:r.id,name:r.name}))} canCreate canUpdate={false} canCheckout={false} /> : <CourseWorkspace selectedDate={date} today="2026-10-01" nowIso={parseTaipeiDateTime("2026-10-01","10:00")!.toISOString()} calendarDays={{}} staffAvailability={[]} staffAvailabilityExceptions={[]} rooms={rooms} templates={templates} sessions={sessions} coaches={coaches} cancelledBookings={[]} canCreate={false} canEdit={false} businessProfile={reviewModule === "music" ? "MUSIC" : "FITNESS"} view="schedule" />}
    </DashboardShell>;
  }
  const params = new URLSearchParams({module: reviewModule, date, scheduleView: query.scheduleView ?? "month"});
  return <main className="p-4">
    <h1 className="text-xl font-bold">課表 RWD 驗收 · {reviewModule}</h1>
    <p>真實共用元件搭配虛擬資料；登入、資料庫與名單業務驗收另列。</p>
    <nav className="my-3 flex flex-wrap gap-3">{["fitness","music","spa","steamfoot"].map(value => <a key={value} href={`?width=${width}&module=${value}`}>{value}</a>)}</nav>
    <ReviewViewport src={`?frame=1&${params}`} initialWidth={width} />
  </main>;
}

