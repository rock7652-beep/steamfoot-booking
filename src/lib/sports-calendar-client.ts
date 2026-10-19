import type {loadSportsCalendar} from "@/server/actions/sports-calendar";

/** Independent JSON read transport: background reads do not queue ahead of Server Action writes. */
export async function readSportsCalendar(date: string): Promise<Awaited<ReturnType<typeof loadSportsCalendar>>> {
  const prefix = window.location.pathname.split("/dashboard")[0];
  const response = await fetch(`${prefix}/dashboard/courses/calendar-read`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: {"Content-Type": "application/json"}, body: JSON.stringify({date}),
  });
  if (!response.ok) throw new Error("課表讀取失敗");
  return response.json();
}
