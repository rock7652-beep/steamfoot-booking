import type { OperationGuide } from './operation-guide-types';
export const dailyOperationGuides20261031: OperationGuide[] = [
  {
  "id": "PM01",
  "category": "plans",
  "title": "方案如何註銷，或延長／縮短期限？",
  "summary": "在原顧客方案面板管理，填原因並核對占用；註銷收回未用額度，不退款、不刪歷史。",
  "answer": "先核對原持有人、方案、剩餘及期限；管理操作就地完成，送出後重新讀取原結果。",
  "path": "顧客管理 → 原顧客總覽 → 方案卡右側 ⋯ → 調整期限／註銷方案",
  "keywords": "註銷方案 延長期限 縮短期限 原地管理 原請求 預約占用 不退款 跨模組 音樂 運動 蒸足 美業 同頁 日期格下方 更多操作 方案卡右側 更多操作 補登已服務 註銷次數",
  "steps": [
    "在正確方案卡核對名稱、可預約額度、期限及既有預約，再點右側「⋯」選「調整期限」或「註銷方案」。",
    "調整期限填新日期與原因；縮短不能截斷既有預約，各模組仍有日期限制。",
    "註銷前先處理預約占用，填原因確認；不為了註銷自行取消正式顧客預約。",
    "處理中不能重開或重送；結果未明只核對原請求，完成後重讀原方案與歷史。"
  ],
  "important": "註銷不是退款；保留收款及已使用紀錄。共用卡須能管理全部關聯學員，子店唯讀與權限不足不能操作。",
  "success": "新期限或註銷結果與原方案一致，沒有重複退款、補點或刪除歷史。",
  "details": [
    "只註銷部分堂數或補登歷史上課，從「⋯」選對應的補登／註銷堂數項目，詳見 PLAN-SESSION-ADJUST；它與註銷整張方案、改期限及退款不同。補登會扣額度，更正返還追加新紀錄，不刪原紀錄。蒸足另以「調整剩餘堂數」進入原更正表單，不把直接改餘額當成補登。",
    "運動／音樂新期限不早於今天或建立日，且在未來十年內；美業日期依自身規則。蒸足沿用原期限編輯器，不因共用呈現改寫單位與日期規則。",
    "音樂手動指定期限成為權威期限，但既有補課與來源綁定權益保留原流程。",
    "並行異動若餘額、期限或狀態改變，重開核對；回覆遺失不代表失敗，沿用原請求不另註銷一次。",
    "音樂／運動總覽方案卡的「⋯」集中補登、註銷堂數、調整期限與整份註銷；原生課程在原格子下方展開表單，取消回原卡。美業從總覽選單進入既有方案管理；各模組保留原確認與取消，不因選單點擊就扣額度。來源匯入或補課權益仍走專用流程。",
    "蒸足、音樂、運動與美業的堂數／次數方案皆以同份日期格核對，寬容器最多10格，窄容器自然換行；預約占用不填已用日期。共用方案只一份總進度，點日期看使用人，點數方案保留逐次明細。"
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
    "src/lib/plan-management.ts",
    "src/components/admin/plan-usage-grid.tsx",
    "src/components/admin/plan-grid-actions.tsx",
    "src/app/(dashboard)/dashboard/courses/member-workspace.tsx"
  ]
},
  {
    "id": "DM01",
    "category": "care",
    "title": "數位店長的門市訊息與 LINE 通知有什麼不同？",
    "summary": "後台持續收集本店訊息；最新與歷史依發布時間及已讀狀態區分，LINE 另依偏好與送達紀錄。",
    "answer": "在數位店長核對顧客需求、待核帳、待收款及門市待辦；已讀只是回查狀態，原交易與客服仍要到對應資料處理。",
    "path": "後台頂欄 → 數位店長 → 最新消息／歷史訊息",
    "keywords": "數位店長 數位管家 鈴鐺 小鈴噹 最新消息 歷史訊息 已讀 未讀 全部標為已讀 72小時 3天 10天 復原 待收款 尚欠 待核帳 真人客服 催辦 續購需求 每日待辦 LINE獨立",
    "steps": [
  "確認目前門市，開啟數位店長並核對發布時間與原業務對象。",
  "在最新消息或歷史訊息展開資料；依可見的查看入口查原預約、收款或顧客需求。",
  "逐筆或全部標為已讀後等待確認；回歷史查詢，原業務仍依專用流程完成。"
],
    "important": "LINE 總開關及個人偏好不控制後台數位店長；看得到訊息不表示有權限改原交易，已讀或到期也不代表帳款結清。",
    "success": "訊息、未讀數及原資料能對應，沒有把已讀、到期或讀取失敗當成付款完成。",
    "details": [
  "最新消息只列發布未滿 72 小時的未讀訊息；標為已讀後移到歷史訊息，滿 72 小時的未讀也進入歷史。自發布起最多顯示 10 天，已讀、取消已讀及重讀都不延長期限；到期隱藏不代表刪除原業務紀錄或欠款結清。",
  "逐筆點 ○ 標為已讀時可先移除該列，但顯示儲存中並非成功；確認後才可復原，失敗會還原。歷史內點 O 標為未讀，發布未滿 72 小時才回到最新；較舊訊息仍在歷史。結果未確認時先重新讀取核對。",
  "「全部標為已讀」涵蓋目前門市有效期內兩個分頁的未讀訊息，不限目前這一頁；成功確認後最新列表清空並回第一頁，再讀取校正，歷史訊息保留至原到期時間。它不代表付款、客服或預約已完成。",
  "入口只顯示圖示，滑鼠提示及面板名稱是「數位店長｜門市提醒」；角標是有效期內未讀數，包含已滿 3 天仍未讀的歷史訊息。數量未知時不顯示假的零筆。約每 60 秒及切回視窗核對，不是即時推播；清單在開啟時才讀取，由新到舊，每頁最多 50 筆。",
  "後台持續接收門市提醒，不受店長個人 LINE 偏好控制。提示音只控制目前裝置與門市，採雙音且需瀏覽器先有互動；第一次載入既有訊息不響鈴，裝置靜音或自動播放限制仍可能無聲。",
  "完成服務、未到及恢復預約／恢復上課不另發面板提醒，既有同類訊息也不列入清單或未讀數；預約、出席、扣堂與 LINE 的原規則不因此改變。",
  "「待收款」與「待核帳」不同；有付款查閱權限才顯示尚欠金額與收款入口。收齊、免收或取消應收後，下一次核對解除待收款；已接受的單次／體驗最終收款不把原價差額當欠款，音樂學費依原分次收款帳核對。未確認的收款先查原請求，不重收。",
  "顧客詢問、新名單、要求真人客服、催辦及明確續購需求沿共用面板查看。約 30 分鐘未指派的客服催辦會取代原待接手訊息，接手後解除；續購只來自明確回覆或表單，不憑低堂數、瀏覽行為猜測。",
  "同一筆應收只留一則，部分收款更新剩餘，不每日重新計時；處理原事件後依本店來源核對解除，保留原收款歷史。",
  "蒸足、運動／音樂及美業沿用各自資料、權限與帳務規則；找不到訊息先分辨讀取失敗、已讀、到期、已解除與權限，不把面板當完整營運帳。"
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
    ,
"src/lib/store-notice-lifecycle.ts",
"src/lib/digital-manager-demand.ts",
"src/server/services/store-receivable-notices.ts",
"src/server/actions/beauty-store-notices.ts"
]
  }
];
