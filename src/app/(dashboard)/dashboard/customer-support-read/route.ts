import { loadCoursePhoneConnection } from "@/server/actions/course-phone-view";
import { loadMusicStudentMakeups } from "@/server/actions/music-student-makeups";
import { loadMusicStudentWorkspace } from "@/server/actions/music-student-workspace";
import { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
import { loadMemberConnectionAction } from "@/server/actions/store-member-connection";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

// Reuse the existing readers so every request still checks the current actor,
// permission and store visibility. This endpoint never performs a mutation.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const customerId = params.get("customerId");
  const kind = params.get("kind");
  const dataScope = params.get("dataScope");
  if (!customerId || customerId.length > 200 || (!kind || !["connection", "advanced", "phone", "makeups", "overview"].includes(kind)) || (dataScope !== null && dataScope !== "operational" && dataScope !== "legacy")) {
    return Response.json({ success: false, error: "參數無效" }, { status: 400, headers });
  }
  if (kind === "phone") return Response.json(await loadCoursePhoneConnection(customerId), { headers });
  if (kind === "makeups") return Response.json(await loadMusicStudentMakeups(customerId, dataScope ?? undefined), { headers });
  if (kind === "overview") return Response.json(await loadMusicStudentWorkspace(customerId, false), { headers });
  const result = kind === "connection"
    ? await loadMemberConnectionAction(customerId)
    : await getCustomerPanelAdvanced(customerId);
  return Response.json(result, { headers });
}
