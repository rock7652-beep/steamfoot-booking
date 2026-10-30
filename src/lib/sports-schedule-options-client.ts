import type {loadSportsStaging} from "@/server/actions/sports-staging";

/** Independent read; does not queue behind mutations or persist financial metadata. */
export async function readSportsScheduleOptions(): Promise<Awaited<ReturnType<typeof loadSportsStaging>>> {
  const prefix = window.location.pathname.split("/dashboard")[0];
  const response = await fetch(`${prefix}/dashboard/courses/schedule-options`, {credentials:"same-origin",cache:"no-store"});
  if (!response.ok) throw new Error("無法讀取排課資料，請重試。");
  const result = await response.json();
  if (typeof result?.success !== "boolean") throw new Error("排課資料回應格式不符，請重試。");
  return result;
}
