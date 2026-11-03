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

/** The sync keeps all existing write checks but does not trigger a full RSC page render. */
export async function syncSportsCalendar(date:string):Promise<{success:true;warning?:string|null}|{success:false;error:string}> {
  const prefix=window.location.pathname.split("/dashboard")[0];
  const response=await fetch(`${prefix}/dashboard/courses/calendar-sync`,{
    method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({date}),
  });
  if(!response.ok)throw new Error("課表同步失敗");
  return response.json();
}
export async function readMusicCalendar(date:string):Promise<Awaited<ReturnType<typeof import("@/server/actions/sports-calendar").loadMusicCalendar>>> {
  const prefix=window.location.pathname.split("/dashboard")[0];
  const dataScope=new URLSearchParams(window.location.search).get("dataScope")??undefined;
  const response=await fetch(`${prefix}/dashboard/courses/calendar-read`,{
    method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,profile:"MUSIC",dataScope}),
  });
  if(!response.ok)throw new Error("課表讀取失敗");
  return response.json();
}
