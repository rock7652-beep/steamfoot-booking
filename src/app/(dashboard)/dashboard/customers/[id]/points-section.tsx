import { POINT_LABELS } from "@/lib/points-config";
import type { PointType } from "@prisma/client";

interface PointItem {
  id: string;
  type: PointType;
  points: number;
  note: string | null;
  createdAt: string; // ISO string
}

interface Props {
  totalPoints: number;
  recentPoints: PointItem[];
}

export function PointsSection({ totalPoints, recentPoints }: Props) {
  return (
    <div className="mt-4 rounded-lg border border-earth-100 bg-earth-50/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-earth-500">行動積分</h3>
        <span className="text-lg font-bold text-primary-600">{totalPoints} 分</span>
      </div>

      {recentPoints.length === 0 ? (
        <p className="mt-3 text-center text-xs text-earth-400">尚無積分紀錄</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {recentPoints.map((p) => {
            const dateStr = new Date(p.createdAt).toLocaleDateString("zh-TW", {
              timeZone: "Asia/Taipei",
              month: "numeric",
              day: "numeric",
            });
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 text-xs shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-earth-400">{dateStr}</span>
                  <span className="text-earth-700">{POINT_LABELS[p.type]}</span>
                  {p.note && (
                    <span className="text-earth-400">· {p.note}</span>
                  )}
                </div>
                <span className="font-bold text-green-600">+{p.points}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
