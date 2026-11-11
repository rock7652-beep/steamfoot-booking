import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261025: OperationGuide[] = [
  {
    id: "C177",
    category: "hours",
    title: "如何設定開放選課與指定學員？",
    summary: "開放選課與指定學員是兩個獨立排課模式；關閉其中一個不會取消既有課表、方案、帳務或候補順位。",
    answer: "到營業與預約的排課模式分別切換；儲存後重新核對兩個開關，排課畫面只會提供目前開啟的模式。",
    keywords: "排課模式 開放選課 指定學員 自由選課 固定學員 混合排課 剩餘名額 同時安排固定學員 關閉模式 恢復排課 候補 自動遞補",
    path: "設定 → 營業與預約 → 排課模式",
    steps: [
      "分別核對開放選課與指定學員；兩者可以同時開啟，也可只開啟其中一項。",
      "調整需要的模式並儲存；看到已儲存後重新開啟設定，確認兩個值各自保持。",
      "回到新增排課，確認只顯示已開啟的模式；需要恢復時回設定開啟對應模式。",
      "音樂／運動的一般課可選開放選課，再勾選「同時安排固定學員」；先填總名額，再指定固定學員，剩餘名額供自由選課。此選項需要兩種排課模式同時開啟。",
    ],
    important: "切換不會取消舊課、重排候補、改方案額度或發通知；自行預約、請假與改期仍由各自開關及課堂規則決定。",
    success: "兩個開關顯示正確狀態，新增排課只提供已開啟的模式，既有課堂與紀錄仍保留。",
    details: [
      "混合課的固定學員與自由選課共用總名額，不能超額指定；固定系列會延續固定名單。固定學員請假只釋出該名額，不會關閉整堂自由選課。老師請假／停課仍依原規則。",
      "運動固定名單與自由選課皆核對同科目方案；A1／A2／A3 可用額度合計，B／C 科目不計入，一次只扣一張卡。音樂仍各自使用個人方案。取消後重新自行選課仍重新核對資格與可用額度。",
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
