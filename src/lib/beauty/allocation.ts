import { parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import {resolveAddOns,addOnTotals} from "./add-ons";
import {serviceDuration} from "./service-duration";
import { rate, type Rate } from "./contracts";
export type Range = { start: number; end: number };
export type Service = {
  addOnGroups?: unknown;
  defaultRate?:unknown;
  id: string;
  name: string;
  duration: number;
  trialDuration?:number|null;
  buffer: number;
  active: boolean;
  price: number;
  trialPrice: number | null;
};
export type Technician = {
  id: string;
  gender: string;
  serviceIds: string[];
  sort: number;
  active: boolean;
  weekly: unknown;
  exceptions: unknown;
  rates: unknown;
};
export type Occupancy = Range & {
  technicianId: string;
  locationId: string;
  duration: number;
  status: string;
};
export type Person = {
  addOnIds?: string[];
  /** Trusted server-resolved per-charge restriction; absent preserves legacy allocation. */
  allowedTechnicianIds?: readonly string[];
  isTrial?:boolean;
  serviceId: string;
  preference: "FEMALE" | "MALE" | "ANY";
  specifiedTechnicianId: string | null;
  specifiedLocationId?: string | null;
};
export type Assignment = {
  technicianId: string;
  locationId: string;
  serviceId: string;
  endsAt: Date;
  occupiedEndsAt: Date;
  rate: Rate;
};
export const overlaps = (a: Range, b: Range) =>
  a.start < b.end && a.end > b.start;
type Period = { start: string; end: string };
export function containsPeriod(
  date: string,
  start: number,
  end: number,
  periods: Period[],
) {
  return periods.some((p) => {
    const s = parseTaipeiDateTime(date, p.start),
      e = parseTaipeiDateTime(date, p.end);
    return !!s && !!e && s.getTime() <= start && e.getTime() >= end;
  });
}
export function availableTechnician(
  t: Technician,
  date: string,
  start: number,
  end: number,
) {
  if (!t.active) return false;
  const exceptions = t.exceptions as Record<string, Period[]>;
  if (Object.hasOwn(exceptions, date))
    return containsPeriod(date, start, end, exceptions[date]);
  if (!Array.isArray(t.weekly) && (t.weekly as {inheritStore?:boolean})?.inheritStore === true) return true;
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return containsPeriod(
    date,
    start,
    end,
    (t.weekly as (Period & { day: number })[]).filter((p) => p.day === day),
  );
}
/** Backtracking across the party avoids assigning the sole facial specialist
 * to a massage first. Candidate order implements daily workload + fixed order. */
export function allocateParty(input: {
  onUnavailable?:(reason:string)=>void;
  date: string;
  startsAt: Date;
  people: Person[];
  services: Service[];
  technicians: Technician[];
  locationIds: string[];
  occupied: Occupancy[];
  hours: Period[];
}): Assignment[] | null {
  if (
    input.people.length > input.locationIds.length ||
    input.people.length > input.technicians.filter((t) => t.active).length
  )
    {input.onUnavailable?.('可用技師或位置數不足，無法同時安排本次顧客');return null;}
  const start = input.startsAt.getTime();
  const day = input.date;
  const occupied = input.occupied.filter((o) => o.status !== "CANCELLED");
  const workload = (id: string) =>
    occupied
      .filter(
        (o) =>
          o.technicianId === id && toLocalDateStr(new Date(o.start)) === day,
      )
      .reduce((n, o) => n + o.duration, 0);
  const ordered = [...input.technicians].sort(
    (a, b) =>
      workload(a.id) - workload(b.id) ||
      a.sort - b.sort ||
      a.id.localeCompare(b.id),
  );
  const choices = input.people.map((p) => {
    const s = input.services.find((s) => s.id === p.serviceId && s.active);
    if (!s) return null;
    const duration=serviceDuration(s,p.isTrial)+addOnTotals(resolveAddOns(s.addOnGroups,p.addOnIds)).duration;
    const end = start + (duration + s.buffer) * 60000;
    if (!containsPeriod(day, start, end, input.hours)){input.onUnavailable?.('服務與整理時間超出營業時段，請調整開始時間');return null;}
    const techs = ordered.filter(
      (t) =>
        (!p.specifiedTechnicianId || t.id === p.specifiedTechnicianId) &&
        (p.allowedTechnicianIds === undefined || p.allowedTechnicianIds.includes(t.id)) &&
        t.serviceIds.includes(s.id) &&
        (p.preference === "ANY" || t.gender === p.preference) &&
        availableTechnician(t, day, start, end) &&
        rate.safeParse((t.rates as Record<string, unknown>)[s.id]??s.defaultRate).success &&
        !occupied.some(
          (o) => o.technicianId === t.id && overlaps({ start, end }, o),
        ),
    );
    const rooms = [...input.locationIds]
      .sort()
      .filter(
        (id) =>
          (!p.specifiedLocationId || id === p.specifiedLocationId) && !occupied.some(
            (o) => o.locationId === id && overlaps({ start, end }, o),
          ),
      );
    if(!techs.length){
      const qualified=ordered.filter(t=>t.active&&(!p.specifiedTechnicianId||t.id===p.specifiedTechnicianId)&&(p.allowedTechnicianIds===undefined||p.allowedTechnicianIds.includes(t.id))&&t.serviceIds.includes(s.id)&&(p.preference==='ANY'||t.gender===p.preference)&&rate.safeParse((t.rates as Record<string,unknown>)[s.id]??s.defaultRate).success);
      input.onUnavailable?.(!qualified.length?'目前沒有符合服務資格及計酬設定的技師，請到服務項目或技師管理核對':!qualified.some(t=>availableTechnician(t,day,start,end))?'此時段合格技師未排班，排班須涵蓋服務與整理時間':'此時段合格技師已有預約或整理時間，請改選技師或時間');
    }else if(!rooms.length)input.onUnavailable?.(p.specifiedLocationId?'指定位置在服務或整理時間內已被占用，請換位置或時間':'服務與整理時間內沒有可用位置，請調整時間');
    return { s, duration, end, techs, rooms };
  });
  if (choices.some((c) => !c || !c.techs.length || !c.rooms.length))
    return null;
  const valid = choices as NonNullable<(typeof choices)[number]>[];
  // All attendees start together. Technician and space matching are independent;
  // test remaining perfect matching before choosing each preferred candidate.
  // This preserves deterministic workload order without factorial party search.
  const techIds = preferredMatching(valid.map((c) => c.techs.map((t) => t.id)));
  const roomIds = preferredMatching(valid.map((c) => c.rooms));
  if (!techIds || !roomIds){input.onUnavailable?.('無法同時分配不重複的技師與位置，請調整本次安排');return null;}
  return valid.map((c, i) => ({
    technicianId: techIds[i],
    locationId: roomIds[i],
    serviceId: c.s.id,
    endsAt: new Date(start + c.duration * 60000),
    occupiedEndsAt: new Date(c.end),
    rate: rate.parse(
      (
        c.techs.find((t) => t.id === techIds[i])!.rates as Record<
          string,
          unknown
        >
      )[c.s.id]??c.s.defaultRate,
    ),
  }));
}
function preferredMatching(choices: string[][]): string[] | null {
  const used = new Set<string>(),
    result: string[] = [];
  function feasible(from: number) {
    const assigned = new Map<string, number>();
    function augment(i: number, seen: Set<string>): boolean {
      for (const id of choices[i]) {
        if (used.has(id) || seen.has(id)) continue;
        seen.add(id);
        const previous = assigned.get(id);
        if (previous === undefined || augment(previous, seen)) {
          assigned.set(id, i);
          return true;
        }
      }
      return false;
    }
    for (let i = from; i < choices.length; i++)
      if (!augment(i, new Set())) return false;
    return true;
  }
  for (let i = 0; i < choices.length; i++) {
    let found = false;
    for (const id of choices[i]) {
      if (used.has(id)) continue;
      used.add(id);
      if (feasible(i + 1)) {
        result.push(id);
        found = true;
        break;
      }
      used.delete(id);
    }
    if (!found) return null;
  }
  return result;
}
export function serviceFee(
  rule: unknown,
  list: number,
  paid: number,
  sessions = 1,
  duration = 60,
): number {
  const r = rate.parse(rule);
  if (
    !Number.isSafeInteger(sessions) ||
    sessions < 1 ||
    !Number.isInteger(duration) ||
    duration <= 0 ||
    ![list, paid].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    throw new Error("計酬金額待核對");
  if (r.mode === "HOURLY") return Math.round((r.value * duration) / 60);
  return r.mode === "FIXED"
    ? r.value
    : Math.round(
        (((r.base === "LIST" ? list : paid) / sessions) * r.value) / 100,
      );
}
