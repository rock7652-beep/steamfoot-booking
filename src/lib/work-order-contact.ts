type Hours = { dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null; segments?: unknown };
const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
/** Group identical weekly hours without inventing hours for unconfigured days. */
export function workOrderHours(hours: Hours[]): string[] {
  const groups = new Map<string, string[]>();
  for (const row of [...hours].sort((a,b)=>(a.dayOfWeek||7)-(b.dayOfWeek||7))) {
    let text = "公休";
    if(row.isOpen) {
      const segments = Array.isArray(row.segments) ? row.segments.filter((s): s is {openTime:string;closeTime:string}=>!!s&&typeof s==="object"&&typeof s.openTime==="string"&&typeof s.closeTime==="string") : [];
      text=segments.length?segments.map(s=>`${s.openTime}–${s.closeTime}`).join("、"):row.openTime&&row.closeTime?`${row.openTime}–${row.closeTime}`:"";
    }
    if(!text || !dayNames[row.dayOfWeek])continue;
    const days=groups.get(text)??[];days.push(dayNames[row.dayOfWeek]);groups.set(text,days);
  }
  return [...groups].map(([text,days])=>`${days.join("、")} ${text}`);
}
