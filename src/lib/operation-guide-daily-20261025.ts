import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261025: OperationGuide[] = [
  {
    id: "C177",
    category: "hours",
    title: "如何設定開放選課與指定學員？",
    summary: "開放選課與指定學員是兩個獨立排課模式；關閉其中一個不會取消既有課表、方案、帳務或候補順位。",
    answer: "到營業與預約的排課模式分別切換；儲存後重新核對兩個開關，排課畫面只會提供目前開啟的模式。",
    keywords: "排課模式 開放選課 指定學員 自由選課 固定學員 關閉模式 恢復排課 候補 自動遞補",
    path: "設定 → 營業與預約 → 排課模式",
    steps: [
      "分別核對開放選課與指定學員；兩者可以同時開啟，也可只開啟其中一項。",
      "調整需要的模式並儲存；看到已儲存後重新開啟設定，確認兩個值各自保持。",
      "回到新增排課，確認只顯示已開啟的模式；需要恢復時回設定開啟對應模式。",
    ],
    important: "切換不會取消舊課、重排候補、改方案額度或發通知；自行預約、請假與改期仍由各自開關及課堂規則決定。",
    success: "兩個開關顯示正確狀態，新增排課只提供已開啟的模式，既有課堂與紀錄仍保留。",
    details: [
      "關閉開放選課後不能再新增該模式課程，會員也不能新增選課或加入候補；既有課堂及候補紀錄保留，恢復開啟不會立即批次補跑候補。",
      "關閉指定學員後不能再新增該模式排課；既有固定課堂仍可查看，並依原規則處理請假、補課與更正。",
      "排課精靈會隱藏未開啟的模式，後端仍會再次檢查，不能用舊頁面繞過設定。空間租借另依租借規則。",
      "若顯示已儲存但畫面仍在同步，先重新開啟核對目前值；結果未確認前不要連續切換。",
    ],
    modules: ["course"],
    permission: "business_hours.manage",
    feature: null,
    sources: [
      "src/components/admin/course-scheduling-mode-settings.tsx",
      "src/server/actions/course-scheduling-modes.ts",
      "src/app/(dashboard)/dashboard/courses/music-schedule-wizard.tsx",
      "src/server/services/course-booking.ts",
    ],
    verification: "source-reviewed",
    kind: "howto",
  },
];
