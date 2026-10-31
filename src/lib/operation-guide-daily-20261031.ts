import type { OperationGuide } from './operation-guide-types';
export const dailyOperationGuides20261031: OperationGuide[] = [
  {
    "id": "PM01",
    "category": "plans",
    "title": "方案如何註銷，或延長／縮短期限？",
    "summary": "在原顧客方案面板管理，填原因並核對占用；註銷收回未用額度，不退款、不刪歷史。",
    "answer": "先核對原持有人、方案、剩餘及期限；管理操作就地完成，送出後重新讀取原結果。",
    "path": "顧客管理 → 原顧客 → 持有方案 → 管理方案",
    "keywords": "註銷方案 延長期限 縮短期限 原地管理 原請求 預約占用 不退款 跨模組 音樂 運動 蒸足 美業",
    "steps": [
      "開啟正確方案並核對餘額、期限及既有預約。",
      "調整期限填新日期與原因；縮短不能截斷既有預約，各模組仍有日期限制。",
      "註銷前先處理預約占用，填原因確認；不為了註銷自行取消正式顧客預約。",
      "處理中不能重開或重送；結果未明只核對原請求，完成後重讀原方案與歷史。"
    ],
    "important": "註銷不是退款；保留收款及已使用紀錄。共用卡須能管理全部關聯學員，子店唯讀與權限不足不能操作。",
    "success": "新期限或註銷結果與原方案一致，沒有重複退款、補點或刪除歷史。",
    "details": [
      "運動／音樂新期限不早於今天或建立日，且在未來十年內；美業日期依自身規則。蒸足沿用原期限編輯器，不因共用呈現改寫單位與日期規則。",
      "音樂手動指定期限成為權威期限，但既有補課與來源綁定權益保留原流程。",
      "並行異動若餘額、期限或狀態改變，重開核對；回覆遺失不代表失敗，沿用原請求不另註銷一次。"
    ],
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "permission": "wallet.adjust",
    "additionalPermissions": [
      "customer.read"
    ],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/components/admin/plan-management-controls.tsx",
      "src/server/services/steam-wallet-management.ts",
      "src/server/services/course-card-management.ts",
      "src/server/beauty/card-management.ts",
      "src/lib/plan-management.ts"
    ]
  },
  {
    "id": "DM01",
    "category": "care",
    "title": "數位管家小鈴噹的待辦與 LINE 通知有什麼不同？",
    "summary": "後台持續收集本店待辦；LINE 另依本店總開關及個人偏好，不會互相代替。",
    "answer": "在頂欄鈴噹核對待確認付款、未完成服務、真人客服催辦與每日待辦；原業務操作仍要進正確資料處理。",
    "path": "後台頂欄 → 小鈴噹 → 待處理／已處理",
    "keywords": "數位管家 小鈴噹 門市待辦 待確認付款 服務未完成 真人客服 催辦 每日待辦 LINE獨立",
    "steps": [
      "確認目前門市，開啟小鈴噹並核對待辦來源與日期。",
      "展開需要處理的項目，沿原查看入口查目前付款、預約或客服狀態。",
      "完成原業務後重新讀取待辦；單純標記通知不代表已核帳、完成服務或回覆客服。"
    ],
    "important": "本店 LINE 通知總開關及個人偏好不控制後台小鈴噹；提示音另由裝置設定。看得到待辦不代表有權限改原交易。",
    "success": "待辦與原資料能對應，沒有因重讀或重試重開已處理事件或重複付款。",
    "details": [
      "待辦屬本店共用事件；讀取時依目前門市與權限解析最新資料，不憑歷史摘要猜測金額。",
      "處理原事件會依同店事件識別收斂待辦；重試不應重複建立或重開已處理項目。",
      "新預約、付款、未完成與客服各有觸發規則；無待辦不等於零業務，也不代表LINE已送達。",
      "美業使用自己的資料與權限，不把運動扣堂、蒸足容量或其他模組帳務規則套入。"
    ],
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "permission": "booking.read",
    "feature": null,
    "kind": "explanation",
    "verification": "source-reviewed",
    "sources": [
      "src/server/services/digital-manager-notices.ts",
      "src/server/beauty/digital-manager-reminders.ts",
      "src/components/admin/store-notice-bell.tsx",
      "src/server/actions/course-digital-manager-notices.ts"
    ]
  }
];
