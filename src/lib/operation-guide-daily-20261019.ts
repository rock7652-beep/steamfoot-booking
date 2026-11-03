import type { OperationGuide } from "./operation-guide-types";

/** Scoped alignment at production 8d717d5d; rollout and interaction acceptance are separate. */
export const dailyOperationGuides20261019: OperationGuide[] = [
  {
    "id": "C171",
    "category": "settings",
    "title": "為什麼我的運動課表還是舊版，或新版無法載入？",
    "summary": "正式運動店只要已開通運動模組即使用原生新版；仍需必要權限與資料庫就緒，音樂店維持分流。",
    "answer": "先核對門市、運動模組資格與本店操作範圍，再請管理者確認權限及就緒狀態，不自行重建店家。",
    "path": "運動店後台 → 課表排程",
    "keywords": "新版運動 舊版課表 工作區 未開放 必要權限 資料量超過 500 唯讀子店 模組資格 新店自動使用 1000 月課表 排課準備 計酬權限",
    "steps": [
      "確認目前門市與本店操作範圍；已啟用新版運動仍沿用原課表的月／週／日視圖，不以獨立工作區或三個分頁判斷是否啟用。",
      "Owner 查看子店或明確唯讀模式只提供授權的閱讀範圍，不載入可寫表單或自動展課；權限不足時依提示處理，不把舊表單當作回退方式。",
      "若出現無法載入、未開放或資料量超過範圍，保留錯誤與門市交由管理者查就緒狀態，不反覆建店、刪顧客或調整歷史交易。"
    ],
    "important": "正式店與未來新店依 business.fitness 模組資格使用新版，不再逐店加入部署白名單；未開通或查詢失敗會明示阻擋。店長不需修改旗標、資料庫權限或執行 migration。",
    "details": [
  "閱讀原課表需預約查看；準備新版排課表單另需方案編輯、顧客查看、方案查看及營運查看，且為本店可寫視角。單純排課不要求計酬讀取，也不回傳計酬；收款、退款及薪酬各有獨立授權。",
  "排課準備資料的課次、出租、顧客任一清單超過 500 筆會明確拒絕載入；月課表背景讀取對課次／出租各有 1,000 筆保護。兩者不是同一清單，不把拒絕當空資料或要求刪資料。",
  "已有永久系列後，不可用舊部署旗標或白名單退回不懂永久系列的舊程式。需由管理者依發布程序先停止新增、處理未來系列並對帳，保留歷史、出席更正與補課；店長不要自行改旗標、手動還點或刪表。",
  "課表月、週、日共用約 60 秒背景更新；切回可見分頁、重新連線或回到視窗時會再核對。編輯、提交或結果未確認時暫停，不會自動儲存草稿，也不是即時推播。名單明細另有自己的更新節奏。",
  "舊固定系列若名單超額，課表仍可讀並顯示提示；異常系列暫不展課，同店正常系列繼續展課。保留提示與日期交由管理者核對容量及名單，不截斷名單或重建歷史。"
],
    "success": "能辨識新版啟用、權限、子店唯讀與資料就緒問題，不把原介面或拒絕載入當成空資料。",
    "modules": [
      "course"
    ],
    "permission": "booking.read",
    "feature": null,
    "kind": "troubleshooting",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/courses/page.tsx",
      "src/lib/sports-staging.ts",
      "src/lib/sports-background-sync.ts",
      "src/server/actions/sports-staging.ts",
      "src/server/services/sports-production-readiness.ts",
      "src/server/services/sports-permanent-series.ts",
      "src/lib/sports-series-storage.ts",
      "scripts/sports-production-scope.mjs"
    ]
  },
  {
    "id": "C172",
    "category": "plans",
    "title": "新版運動的教學項目與收費方式怎麼建立？",
    "summary": "教學項目管理名稱、分類、可授課教練及開放課扣點；收費方式再分指定項目方案與開放選課通用卡。",
    "answer": "限已啟用新版運動，先建立教練，再於教學項目設定授課資格與開放課每堂扣點；收費方式選指定項目方案或開放選課通用卡，不能混用權益。",
    "path": "新版運動 → 店務管理 → 教學項目／收費方式",
    "keywords": "單次收費 體驗店家費用 價格與分帳 新版運動 教學項目 收費方式 運動名稱 點數 堂數 每堂扣抵 可授課教練 指定項目方案 開放選課通用卡 既有方案 保留原規則 共用額度 舊卡快照 教師計酬方式 拆帳 固定鐘點",
    "steps": [
      "先完成營業時間、空間，再新增至少一位啟用教練；接著建立教學項目，填名稱與分類、勾選可授課教練，並設定開放選課每堂扣點。",
      "在收費方式點「新增收費方式」，預設單次收費，可切換多次方案；選指定項目或開放選課，再填售價、效期並勾選此筆收費可安排的合格教練。",
      "指定項目方案須選教學項目；點數卡填每堂使用點數，堂數卡固定每次 1 堂。通用卡不綁項目，只適用開放選課，並依該教學項目的每堂扣點。依授權及方案限制決定是否允許共用額度。",
      "看到「收費方式已儲存」後核對原列；第五步須有效收費及對應授課資格才算完成，再排第一堂課。需售出方案時另依 C112 結帳，不把建立收費設定當成已收款。"
    ],
    "important": "本題只教已啟用的新工作區。新增教學項目須預約建立權限、修改項目須預約更新權限；新增／更改收費須方案編輯權限。選教練與設定授課資格仍受人員管理範圍控制，且不會授予其後台帳號權限。",
    "details": ["老師／教練的教學項目顯示目前名稱；已選舊授課資格可標為歷史項目，不需刪除重建。既有 LEGACY 且尚無新版收費設定者，只改顧客可購買／後台指派會保留原資格與快照；已有新版設定或新增收費仍需原必填檢查。", "價格、體驗與授課人員改在同一收費編輯器分區設定；店家固定費用留白不分配、0 表示店家不分配，體驗店家費用留白沿用一般費用。單次與多次方案及體驗的分流見 C178。",
      "指定項目方案只適用同一教學項目的指定學員課；開放選課通用卡只適用開放選課。堂數卡每次扣 1 堂，點數卡依方案或教學項目規則扣抵；總額度與每堂扣抵是不同欄位。",
      "一個運動可有多種收費方式。指定項目單次可設定一般時間、體驗價與體驗時間；體驗價留白不提供體驗、填 0 為免費，體驗時間留白沿用一般時間。開放選課沿用店家預設體驗費與課程時間。勾選授課人員只限制這筆收費，不更改教學項目資格；價格與時間不回算歷史課次，也不回算已售卡片，分析仍按體驗／一般與實際出席、收款統計。",
      "顯示「既有方案（保留原規則）」的已售／既有方案不可改成新權益模式；系統依原方案與課程限制處理，不用重建或搬卡。",
      "共用額度仍受總部共卡開通、卡片授權與有效期限制，不因勾選就能跨店或任意代約。",
      "提示資料已更新時保留輸入並重開核對，不覆蓋別人的新版設定；顯示儲存成功但畫面同步失敗時，按更新查現況，不重複建立。",
      "教學項目保存共用計酬預設，教練可另設個別費率；另須薪酬權限，詳見 C176。一般排課不用取得計酬讀取權限。"
    ],
    "success": "教學項目與收費方式對應正確，單位、金額、每堂扣抵、效期及教練清楚，舊卡資料未被重建。",
    "modules": [
      "course"
    ],
    "permission": "plans.edit",
    "additionalPermissions": [
      "booking.read",
      "booking.create",
      "staff.manage",
      "customer.read",
      "wallet.read",
      "transaction.read"
    ],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/courses/music-subject-catalog.tsx",
      "src/app/(dashboard)/dashboard/courses/course-profile-forms.tsx",
      "src/app/(dashboard)/dashboard/courses/member-workspace.tsx",
      "src/server/queries/course-setup.ts",
      "src/lib/course-setup-progress.ts",
      "src/server/actions/sports-staging.ts",
      "src/server/actions/course-members.ts",
      "src/server/services/sports-staging-fee.ts",
      "src/lib/sports-entitlement.ts",
      "src/server/services/sports-teaching-rule.ts"
    ]
  },
  {
    id: "C173", category: "booking", title: "新版運動如何排固定課、指定學員或開放選課？",
    summary: "先選排課類型與教學項目，再分指定學員或開放選課；可另填單堂名稱，留空就沿用項目名稱。",
    answer: "新版一般排課先選教學項目與指定學員或開放選課；可先安排未購課學員，繳費／購買在名單處理，出席時才核對同項目有效權益。",
    path: "新版運動工作區 → 課表 → 新增排課",
    keywords: "新版運動 每週固定 隔週固定 永久系列 單次 體驗 空間出租 指定學員 開放選課 指定項目方案 開放選課通用卡 單堂名稱 沿用教學項目名稱 不預扣 停課 訂閱停用 容量提示 候補未啟用 排課重送 同名教練 先排後付 項目權益 名單購課 待繳費 先買先扣",
    steps: [
  "在原課表開啟新增排課，選每週固定、隔週固定、單次、體驗或空間出租；教學課次先選教學項目，再選具該項目授課資格的教練。",
  "需要區分同一項目的班別時填單堂名稱；留空會沿用教學項目名稱。再選「指定學員」或「開放選課」，核對日期、時間、時長與空間。",
  "指定學員可先排入既有學員，即使尚未購買方案；開放選課先設人數上限。一般排課不再先指定某張售價方案，購課在名單內完成；體驗與出租仍各走原流程。",
  "核對畫面後送出一次；成功後在原課表確認顯示名稱、日期與名單，同步失敗先按更新查原資料，不重建系列。"
],
    important: "本題僅適用已啟用新版。指定項目方案不能預約開放課，通用卡不能預約指定學員課；指定位置也不是出席或已付款。容量或撞期不符時拒絕本次建立；出席結算另查當下有效權益，不為補課次重建重複預約。",
    details: [
  "新增體驗預設可填姓名與手機，也可切既有學員；選單次收費後帶入體驗價與時長，時長留白沿用一般時間，0元仍為免費。沒有體驗價的指定項目不能排體驗；新建顧客與排課同次確認，手機衝突先核對，不任選一筆。排課模式關閉時依目前設定顯示可用欄位；送出錯誤在表單上方，成功回執與班表背景同步分開核對，不重建課次。",
  "每週／隔週固定依 7／14 天延續，後續月份按系列展課，不由四堂／八堂收費限制系列長度。單次及體驗只建立一堂；出租使用租借顧客與金額，不建立教學名單，填金額也不等於已收款。",
  "指定位置不等於已付款或出席。新版一般指定學員可先安排無權益者，名單顯示待繳費；點名出席／未到扣抵前須有同項目有效且足額權益，系統依先買先扣核對，不套用舊版排課須整批綁同一卡的步驟。",
  "開放選課不自動加人；使用通用卡並依教學項目的每堂扣點，堂數通用卡每次扣 1 堂。指定項目卡與通用卡不互換，既有方案維持原規則。",
  "同名教練依實際人員 ID 與授課資格選取；若提示同名需重新選擇，重新整理後選正確教練，不另建重複人員。課卡與課表顯示單堂名稱時，仍以原教學項目判定權益。",
  "開放選課的候補未啟用時，候補人數顯示 0 及「候補未啟用」，不可編輯；啟用時沿用店家預設，不必為排第一堂課開啟全店候補。",
  "同一排課請求重送會核對原收據及原意圖，不重新建立課次；更改學員、方案或人數後不能冒用原請求。HTTP 200 或同步中不等於已建立，須核對業務成功及原課次。",
  "移動固定課僅改本堂，其他課次不動；原位置淡化可排單次，不可建立重複固定系列。取消當次學員、請假／未到釋放當次位置、本堂停課及本堂及後續停課是不同範圍，確認前核對日期與影響名單；款項、出席及返還另按原紀錄核對。",
  "訂閱取消或到期停用後，不再自動產生後續固定課，歷史課表仍可讀；恢復有效訂閱後依原系列展課，不需重建。唯讀子店不自動展課。",
  "固定系列建立及展課都檢查當日有效名單與容量。舊系列超額時顯示提示、該異常系列不新增課次，同店正常系列仍繼續展課；不截斷名單或吞掉其他權限、撞課及資料庫錯誤。交管理者核對，不手動改歷史或補點。"
],
    success: "課次、系列與指定位置正確；永久指定學員未被預扣或預留課卡額度，出席另按有效方案核對，沒有重複系列或把出租／體驗混成一般方案扣抵。",
    modules: ["course"], permission: "booking.create", additionalPermissions: ["booking.read", "plans.edit", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: [
  "src/app/(dashboard)/dashboard/courses/sports-schedule-fields.tsx",
  "src/app/(dashboard)/dashboard/courses/sports-session-name-field.tsx",
  "src/server/actions/sports-staging.ts",
  "src/server/actions/course.ts",
  "src/server/services/sports-staging-schedule.ts",
  "src/server/services/sports-card-selection.ts",
  "src/lib/sports-entitlement.ts",
  "src/server/services/sports-permanent-series.ts",
  "src/server/services/course-booking.ts",
  "src/server/services/course-item-attendance.ts"
],
  },
];
