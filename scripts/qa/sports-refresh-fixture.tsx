// Synthetic transport only: renders the real calendar; never calls business actions.
import { useEffect, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { CourseWorkspace } from "../../src/app/(dashboard)/dashboard/courses/workspace";
import "../../src/app/globals.css";

type Snapshot = { revision: number };
function Fixture() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ revision: 0 });
  useEffect(() => {
    const receive = (event: Event) => setSnapshot((event as CustomEvent<Snapshot>).detail);
    window.addEventListener("qa:snapshot", receive);
    return () => window.removeEventListener("qa:snapshot", receive);
  }, []);
  const props: ComponentProps<typeof CourseWorkspace> = {
    storeId: "synthetic-sports", selectedDate: "2026-10-17", today: "2026-10-17",
    nowIso: "2026-10-17T01:00:00Z", calendarDays: {},
    rooms: [{ id: "room", name: "運動教室・長名稱驗收", category: "教室", capacity: 8, isActive: true }],
    templates: [{ id: "template", name: "運動課程", category: "運動", isActive: true, capacity: 8, pointCost: 1, durationMinutes: 60, defaultRoomId: "room" }],
    sessions: [{ id: "session", templateId: "template", nameSnapshot: `跨視窗課程 ${snapshot.revision}`, startsAt: "2026-10-17T02:00:00Z", endsAt: "2026-10-17T03:00:00Z", coachId: "coach", roomId: "room", capacity: 8, pointCost: 1, bookings: [] }],
    coaches: [{ id: "coach", displayName: "驗收教練", phone: "", status: "ACTIVE", courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: ["template"] }],
    cancelledBookings: [], canCreate: true, canEdit: true, view: "schedule", businessProfile: "FITNESS",
    staffAvailability: [], staffAvailabilityExceptions: [],
  };
  return <main className="min-w-0 p-4">
    <p>運動課表元件驗收・虛構資料／替代路由傳輸</p>
    <output data-testid="revision">{snapshot.revision}</output>
    <CourseWorkspace {...props} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
