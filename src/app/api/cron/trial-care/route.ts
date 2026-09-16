import { runTrialCare } from "@/server/services/trial-care";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runTrialCare();
  return Response.json(result, { status: result.failed ? 500 : 200 });
}
