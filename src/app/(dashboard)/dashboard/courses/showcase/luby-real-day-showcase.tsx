import Link from "next/link";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import { LubyRealDayBoard } from "./luby-real-day-board";

// Transcribed from the provided 2026/9/12 Luby Music screenshot. The date is
// shifted to 9/26 solely so this read-only layout can be compared on one day.
// Group rosters and the cropped teacher names in H3 are not visible in the image.
type Kind = "FIXED" | "CHANGED" | "TRIAL" | "GROUP" | "GROUP_CHANGED" | "RENTAL";
type SourceRow = [room: string, time: string, learner: string, teacher: string, kind: Kind, faded?: "異動／請假" | "已調課"];

const sourceRows: SourceRow[] = [
  ["01", "10:00", "劉懿德", "", "RENTAL"],
  ["01", "15:00", "曾芳榕", "", "RENTAL"],
  ["01", "16:00", "鍾曼宏", "", "RENTAL"],

  ["02", "09:00", "蔡沐剛", "曾筠瀚", "FIXED"],
  ["02", "10:00", "陳銘宸", "曾筠瀚", "FIXED"],
  ["02", "11:00", "吳柏翰", "曾筠瀚", "FIXED"],
  ["02", "12:00", "戴瑜秀", "曾筠瀚", "FIXED"],
  ["02", "13:00", "王韻涵", "曾筠瀚", "FIXED", "異動／請假"],
  ["02", "18:00", "朱宸磊", "曾筠瀚", "FIXED"],
  ["02", "19:00", "張敏軒", "曾筠瀚", "CHANGED", "異動／請假"],
  ["02", "20:00", "曾弘宇", "曾筠瀚", "FIXED"],

  ["03", "09:00", "胡宸華", "鄭怡婷", "CHANGED"],
  ["03", "10:00", "蘇柏謙", "鄭怡婷", "CHANGED"],
  ["03", "11:00", "陳欣怡", "吳興儒", "FIXED"],
  ["03", "14:00", "劉恩璇", "吳興儒", "CHANGED"],
  ["03", "15:00", "莊閔為", "吳興儒", "FIXED"],
  ["03", "16:00", "劉禹寬", "吳興儒", "CHANGED"],
  ["03", "17:00", "葉沁儒", "吳興儒", "FIXED", "異動／請假"],
  ["03", "20:00", "團體班", "鄭怡婷", "GROUP"],

  ["04", "09:00", "鄭皓予", "王國陞", "FIXED"],
  ["04", "10:00", "顏品萱", "王國陞", "FIXED"],
  ["04", "11:00", "邱俐娜", "王國陞", "FIXED"],
  ["04", "12:00", "徐敬恩", "詹俊皓", "FIXED"],
  ["04", "13:00", "許真綜", "詹俊皓", "FIXED"],
  ["04", "14:00", "賴惠宇", "詹俊皓", "CHANGED"],
  ["04", "15:00", "楊婕", "詹俊皓", "FIXED"],
  ["04", "16:00", "徐汶珊", "詹俊皓", "FIXED"],
  ["04", "17:00", "團體班", "詹俊皓", "GROUP"],
  ["04", "18:00", "鍾承恩", "詹俊皓", "FIXED"],
  ["04", "19:00", "吳靜姍", "詹俊皓", "CHANGED"],

  ["05", "09:00", "胡宸華", "鄭怡婷", "FIXED", "已調課"],
  ["05", "10:00", "張睿辰", "李筱婕", "CHANGED"],
  ["05", "11:00", "團體班", "鄭怡婷", "GROUP", "異動／請假"],
  ["05", "12:00", "鄭以霏", "鄭怡婷", "FIXED"],
  ["05", "13:00", "鄭顏樂", "鄭怡婷", "FIXED"],
  ["05", "14:00", "趙家嫻", "鄭怡婷", "CHANGED"],
  ["05", "15:00", "劉羿君", "鄭怡婷", "FIXED"],
  ["05", "16:00", "陳錦弟", "鄭怡婷", "TRIAL"],
  ["05", "17:00", "范睿琳", "鄭怡婷", "CHANGED"],

  ["06", "10:00", "團體班", "張鈺君", "GROUP_CHANGED"],
  ["06", "11:00", "團體班", "張鈺君", "GROUP_CHANGED", "異動／請假"],
  ["06", "12:00", "團體班", "張鈺君", "GROUP_CHANGED"],
  ["06", "13:00", "團體班", "張鈺君", "GROUP_CHANGED"],
  ["06", "16:00", "團體班", "張鈺君", "GROUP_CHANGED"],
  ["06", "17:00", "團體班", "張鈺君", "GROUP_CHANGED"],
  ["06", "18:00", "江晉亮", "張鈺君", "FIXED"],
  ["06", "19:00", "張益安", "張鈺君", "CHANGED"],

  ["H1", "10:00", "張睿辰", "李筱婕", "FIXED", "已調課"],
  ["H1", "11:00", "李冠姍", "李筱婕", "FIXED"],
  ["H1", "14:00", "徐雅隣", "王國陞", "FIXED"],
  ["H1", "15:00", "郭峻岑", "王國陞", "FIXED"],

  ["H2", "09:00", "林書毓", "吳為民", "CHANGED"],
  ["H2", "10:00", "深川智史", "吳為民", "CHANGED"],
  ["H2", "11:00", "李福悌", "吳為民", "FIXED"],
  ["H2", "12:00", "陳子揚", "吳為民", "FIXED"],
  ["H2", "13:00", "謝寧靜", "吳為民", "CHANGED"],
  ["H2", "14:00", "范兆東", "吳為民", "FIXED"],
  ["H2", "17:00", "劉昱賢", "吳為民", "FIXED"],
  ["H2", "18:00", "李詣超", "吳為民", "FIXED"],
  ["H2", "19:00", "吳佳軒", "吳為民", "FIXED", "異動／請假"],

  ["H3", "12:00", "團體班", "吳老師", "GROUP_CHANGED"],
  ["H3", "13:00", "團體班", "吳老師", "GROUP_CHANGED"],
  ["H3", "14:00", "團體班", "曾老師", "GROUP_CHANGED", "異動／請假"],
  ["H3", "16:00", "團體班", "曾老師", "GROUP_CHANGED"],
  ["H3", "17:00", "團體班", "曾老師", "GROUP_CHANGED", "異動／請假"],
];

const rooms = ["01", "02", "03", "04", "05", "06", "H1", "H2", "H3"].map((name) => ({
  id: `luby-${name}`, name: name.startsWith("H") ? name : `教室 ${name}`, isActive: true,
}));
const teacherNames = [...new Set(sourceRows.map((row) => row[3]).filter(Boolean)), "空間租借"];
const coaches = teacherNames.map((displayName, index) => ({
  id: `luby-coach-${index}`, displayName, status: "ACTIVE", courseCoachEnabled: true,
}));
const templates = [
  { id: "luby-private", name: "個別課", classType: "PRIVATE" },
  { id: "luby-group", name: "團體班", classType: "GROUP" },
];

function sessionsFor(date: string) {
  return sourceRows.map(([room, time, learner, teacher, kind, faded], index) => {
    const startsAt = parseTaipeiDateTime(date, time)!;
    const endsAt = new Date(startsAt.getTime() + (kind === "TRIAL" ? 30 : 60) * 60_000);
    const group = kind === "GROUP" || kind === "GROUP_CHANGED";
    const rental = kind === "RENTAL";
    return {
      id: `luby-replica-${index}`,
      templateId: group ? "luby-group" : "luby-private",
      nameSnapshot: group ? "團體班" : rental ? "空間租借" : "個別課",
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
      roomId: `luby-${room}`,
      coachId: coaches.find((coach) => coach.displayName === (teacher || "空間租借"))!.id,
      capacity: group ? 8 : 1,
      pointCost: 0,
      isFixed: kind === "FIXED" || group,
      isBiweekly: false,
      previewKind: kind === "CHANGED" || kind === "GROUP_CHANGED" ? "CHANGED" as const : rental ? "RENTAL" as const : undefined,
      previewFaded: faded,
      previewRosterUnknown: group,
      // The screenshot has no group roster or attendance outcomes. Never invent either.
      bookings: group ? [] : [{
        customerId: `luby-learner-${index}`, customerName: learner,
        status: faded ? "CANCELLED" : "RESERVED",
        bookingKind: kind === "TRIAL" ? "TRIAL" : "REGULAR",
      }],
    };
  });
}

export function LubyRealDayShowcase({ date }: { date: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-earth-900">9/26 陸比實際課表 · 版面對照</h1>
          <p className="text-xs text-earth-700">依 2026/9/12「音教雲」截圖可辨識的 {sourceRows.length} 格重現，移到 9/26 供比較。淡化格保留原學員和老師；只有截圖可確認去向的格標「已調課」，其餘標「異動／請假」。團體學員名單與 H3 截斷的老師姓名未推測。唯讀，不建立或修改真實預約。</p>
        </div>
        <Link href="/dashboard/courses?showcase=music-types&amp;date=2026-09-26" className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs font-medium text-earth-800">返回 49 堂課型示範</Link>
      </div>
      <LubyRealDayBoard
        businessProfile="MUSIC" mode="day" selectedDate={date} today={date}
        sessions={sessionsFor(date)} rooms={rooms} coaches={coaches} templates={templates}
        storePeriods={[{ openTime: "09:00", closeTime: "21:00" }]}
        staffAvailability={[]} staffAvailabilityExceptions={[]}
        readOnly replica
      />
    </div>
  );
}
