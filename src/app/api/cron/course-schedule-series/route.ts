import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { materializeCourseScheduleSeries } from "@/server/services/course-schedule-series";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await materializeCourseScheduleSeries();
    if (result.generated) {
      revalidatePath("/dashboard/courses");
      revalidatePath("/book");
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[CourseScheduleSeries] materialization failed", error);
    return NextResponse.json({ error: "Course schedule generation failed" }, { status: 500 });
  }
}
