import type { OperationGuide } from "./operation-guide-types";

/** Course instructions use the course actions, never the steamfoot wallet rules. */
export const courseOperationGuides: OperationGuide[] = [
  {
    "id": "C101",
    "category": "booking",
    "title": "共卡會員只替另一位學員預約，怎麼操作？",
    "summary": "先分清同行人數預約與指定授權成員代約，再核對方案與額度。",
    "answer": "運動自由選課主畫面為含本人 1–3 人同行，姓名選填；僅在畫面提供具名上課人選擇時，才可選既有授權成員代約。",
    "keywords": "共卡 代約 多人 本人 學員 點數 指定成員 同行模式",
    "path": "會員專區 → 預約課程 → 核對預約方式",
    "steps": [
      "選日期、課程與可用方案，確認畫面是同行人數或具名上課人選擇。",
      "同行流程選含本人 1–3 人，同行姓名可留白；若本人不上課，僅在具名選擇入口勾選既有授權成員，沒有該入口請店家協助。",
      "核對上課者、適用方案及總占用額度，再確認預約。"
    ],
    "important": "共卡授權不會開放其他成員的健康資料，也不會授予教練權限；運動共卡另受總部獨立功能開通狀態限制。",
    "success": "我的預約依同堂課合併，學員逐人列出，能辨識本人與代約。",
    "details": [
      "方案須有效、適用課程且額度足夠；預約保留，出席才正式使用。",
      "共卡是既有方案使用授權，代約是協助預約；新增匿名同行不會新增授權成員。同行人數流程不能用來替本人不上課的具名成員代約。"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(customer)/book/course-portal-client.tsx",
      "src/server/services/course-booking.ts"
    ],
    "kind": "howto",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C102", category: "booking", title: "同堂多人只取消其中一人，怎麼處理？",
    summary: "核對學員姓名後逐人取消，保留其他學員。", answer: "個別取消與取消整堂課是不同操作。",
    keywords: "取消 釋放 占用 歷史 共卡", path: "課表排程 → 選課程 → 學員名單",
    steps: ["選日期並打開課程名單，核對實際上課者。", "在該學員列選取消預約，確認姓名。", "核對該筆狀態、剩餘名額與額度占用；其他學員不應被取消。"],
    important: "不要誤選「取消整堂課」。取消預約不等於退款。",
    success: "該學員轉為已取消並釋放占用，歷史紀錄仍保留。新版運動課程詳情的「取消預約」也只處理該位；核對原扣抵及返還紀錄，不以取消預約當成退款，也不要手動補點。",
    details: ["適用範圍：本題說明原名單的單筆取消；新版運動永久指定學員要分清取消當次、請假／未到釋放當次位置，以及本堂及後續停課。依畫面確認日期與範圍，不以取消一筆預約推定已停止後續系列；詳見 C173。", "會員自行取消受本店取消期限限制；已完成出席不能直接當成未上課取消。", "會員已取消紀錄預設收合，展開歷史仍可查看。"],
    permission: "booking.update", feature: null, sources: ["src/app/(dashboard)/dashboard/courses/roster.tsx", "src/server/actions/course-members.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C103",
    "category": "booking",
    "title": "報到、完成與未到，額度有什麼差別？",
    "summary": "報到只留下到場時間；出席、缺席扣堂及請假依課型與所選方式結算。",
    "answer": "先確認是運動自由預約、固定期課或音樂課，再核對上課者與可操作的出席狀態。",
    "keywords": "報到 出席 完成 扣點 未到 點名 更正 固定期課 音樂課 曠課 請假 團體請假扣堂 自行取消 課表更新 跨裝置同步 原紀錄核對 永久固定未到 待補課 出席狀況",
    "path": "課表排程／音樂課表 → 課程名單 → 點名",
    "steps": [
      "開啟課程名單，核對姓名與目前狀態。",
      "在後台依實際情況選出席、未到或適用的請假；若使用報到，報到只留下到場時間，不扣額度。",
      "誤操作時使用更正，回到待點名後再依實際結果處理。"
    ],
    "important": "報到不扣點。固定期課未到會扣堂；音樂課出席／曠課扣堂，個別／自組班請假不扣堂，團體班請假仍扣 1 堂。不要為了更正另建重複預約。",
    "success": "後端確認成功後，原列才顯示新狀態且額度紀錄一致；重送不應再次扣點。課表及相關營運資料會重新取得；另一裝置未即時反映時，先重新開啟原課次、核對原紀錄，不再點一次出席或更正來刷新畫面。已啟用新版運動的原課表與名單在安全閱讀時，前次讀取完成後約 3 秒安排下次更新；隱藏分頁、編輯、提交或結果未明時暫停，失敗會延長重試間隔，恢復後再回到約 3 秒。這是輪詢，不是即時推播或送達時限；舊課表仍依原 60 秒節奏。",
    "details": [
      "新版運動永久固定課先保留指定學員的位置，不保留或預扣課卡額度；出席時核對當時有效且適用的已付款方案。不要把它與原固定期課未到扣堂規則混用，固定排課與停課另見 C173。",
      "點名送出後原列先顯示處理中並鎖定重複操作；只有後端成功才更新狀態。失敗會保留原狀態並顯示原因，請修正或重新整理後再試，不要連點。",
      "運動自由預約的缺席可依畫面選扣堂或不扣堂；選扣堂不會釋放本次額度，有補課券選項時須另行核對，不能把未到一律當成不扣堂。固定期課依指定課次扣堂，未到不提供補課券，更正才返還。",
      "音樂課沒有補課券：出席與曠課各扣 1 堂；個別／自組班請假不扣堂，可在期限內另約；團體班請假仍扣 1 堂。學員自行取消有方案的音樂預約也按請假課型處理，不會因按鈕叫取消就變成免扣堂；改期另依同交易轉移流程核對。詳細操作另搜尋音樂點名。",
      "教練僅能處理被授權的自身課程，操作受上課時間限制；卡片已退款等狀態不能任意回補額度。",
      "新版永久固定課未到也會核對有效適用方案、扣抵並保留待補課，不是一般 7 日補課券，也不是原固定期課的無補課券規則。錯誤標記取消與更正見 C174；無足額方案時拒絕且尚未扣堂。"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/lib/course-debit-policy.ts",
      "src/server/services/course-booking.ts",
      "src/server/actions/course-portal.ts",
      "src/app/(dashboard)/dashboard/courses/roster.tsx",
      "src/app/(dashboard)/dashboard/courses/workspace.tsx"
    ],
    "kind": "explanation",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C104", category: "hours", title: "公休或縮短可預約日期，為什麼不能儲存？",
    summary: "先處理受影響課程或預約，再調整設定。", answer: "有衝突時整批拒絕，不會偷偷取消課程與學員。",
    keywords: "公休 營業 特殊日 開放期限 衝突 每週營業 設定視窗", path: "設定 → 營業與預約 → 營業／公休／預約開放",
    steps: ["在設定的「營業與預約」找到營業／公休／預約開放，於桌機／平板置中視窗或手機滿版視窗調整每週或指定日期。", "核對預覽並儲存；若提示衝突，查看指出的日期與課程。", "回到課表處理受影響課程，再重新檢查設定。"],
    important: "公休不能覆蓋已排課的時間；縮短開放期限不能留下期限外的有效會員預約。",
    success: "成功儲存後月曆與會員可預約範圍符合設定。",
    details: ["特定日期優先於每週規則，回復預設會移除當日覆寫；每週營業可一次編輯後批次儲存。", "開放期限限制會員新增預約，店長代約沿用後台例外；不會因此放寬教室容量或撞期限制。"],
    permission: "business_hours.manage", feature: null, sources: ["src/server/actions/course-business-hours.ts", "src/server/actions/course-booking-window.ts"], kind: "troubleshooting", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C105",
    "category": "money",
    "title": "課程方案如何登錄協商退款？",
    "summary": "核對實付、已退款、剩餘與占用，再輸入協商金額。",
    "answer": "有退款權限的店長可登錄實際退款金額，累計不得超過原實付。",
    "keywords": "退款 實付 退費 作廢誤建交易 原交易明細 退款試算 選用 停用方案 交易更新 現金抽屜 背景同步 新版運動 實收 淨收款 待核帳 更多工具",
    "path": "營運 → 購買明細 → 登錄退款",
    "steps": [
      "找到原核帳購買，核對已退款及尚可退款；需要查原資料時展開「原交易明細」。",
      "先處理預約占用，再填退款金額、方式及原因；「退款試算（選用）」不會自動帶入金額。",
      "核對收回全部剩餘額度的提示，點「登錄退款並停用方案」，再查看原交易與退款紀錄；系統不會自動退刷或轉帳。"
    ],
    "important": "累計退款不得超過實付。系統記錄退款不代表銀行已自動匯款，實際退款需另行核對。",
    "success": "退款紀錄保留，該卡停用、可用額度為零，收支與訂單一致。退款、更正或作廢成功會讓交易、營收及現金頁重新取得資料；其他已開頁面若尚未反映，先重開原紀錄核對，不重做退款或另補負數交易。",
    "details": [
      "贈送額度不折算現金。參考金額不強制限制協商結果，但累計退款上限仍是實付。",
      "同一退款重送不會再次退款；已結清卡若尚有可退款金額可補登，不會再次收回額度。現金方式需今日抽屜已開店。",
      "建錯或重複交易才用「作廢誤建交易」，須無預約及額度異動，填原因後「確認作廢」；另需作廢權限。實際退還款項不能用作廢冒充退款。",
      "新版運動營運摘要集中顯示實收、退款、淨收款及待核帳筆數，日期口徑從 ⓘ 查看，工具移到「更多工具」。摘要依核帳／收款及退款發生日，清單仍按購買日期，不能用清單總額替代淨收款；交易入口與權限不變。"
    ],
    "permission": "transaction.refund",
    "additionalPermissions": [
      "transaction.read"
    ],
    "feature": null,
    "sources": [
      "src/server/services/course-refund.ts",
      "src/server/actions/course-refund.ts",
      "src/server/actions/course-purchase-correction.ts",
      "src/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions.tsx"
    ],
    "kind": "howto",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C106", category: "care", title: "課程提醒會寄給誰？怎麼確認有沒有送達？",
    summary: "上課提醒給實際學員，店長通知另行指定收件人。", answer: "通知需啟用規則、具備店家功能與額度，並有有效 LINE 連結。",
    keywords: "LINE 提醒 通知 收件人 發送紀錄 改期 取消 確認會到 預約 購買 續購 共用官方帳號 館名", path: "設定 → 提醒管理",
    steps: ["在顧客提醒編輯上課、低額度、到期及體驗後關懷；低額度與用完可顯示預約、購買／續購或諮詢店長。", "前一日提醒可提供改期、取消與確認會到；店長通知另行授權收件人與偏好。", "到發送紀錄核對門市、對象、操作與狀態；跳過或失敗不代表送達。"],
    important: "上課提醒給實際上課者，不會因共卡而寄給其他成員；隔離預覽不向外發送。",
    success: "設定成功後重新開啟仍保留；實際送達需以成功紀錄及收件端確認。",
    details: ["課程上課提醒於前一日18:00處理，取消預約不發送。改期／取消仍由後端重新檢查門市、身分、期限、名額與方案；確認會到不等於出席。", "低額度依可用額度判斷；到期提醒須同時開啟總開關與方案設定。體驗關懷只納入啟用後且課程結束後完成的體驗。", "共用官方 LINE 的諮詢訊息會帶館名，入口與資料仍依門市隔離；一般聊天不猜門市。", "發送紀錄顯示已略過時先看原因；失敗或略過不能當成送達，也不要直接重發全店通知。"],
    permission: "business_hours.manage", feature: "line_reminder", sources: ["src/server/services/course-reminders.ts", "src/server/services/course-manager-notifications.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C107", category: "booking", title: "新課程要先設定哪些資料？",
    summary: "先建立課程預設值，再用預設值排出實際課次。", answer: "課程設定是排課範本；修改範本不會回寫已排好的課次。",
    keywords: "新增課程 課程設定 課型 團課 私課 點數 人數 預設教室 上架 隱藏 下架 批次停用 刪除", path: "店務設定 → 課程設定 → ＋ 新增課程",
    steps: ["輸入課程名稱、課型、分類、時間、人數上限及每人點數。", "視需要選預設教室，填寫課程介紹與注意事項，並選擇上架、隱藏或下架。", "儲存後到課表排程建立實際日期、教練與教室；返回課程清單核對狀態。"],
    important: "已開通新版運動工作區的店家改由「教學項目→收費方式→排課」處理，見 C172／C173；本題保留原課表與音樂流程。範本的時間、容量與點數只是之後排課的預設值；已排課次保留建立當時的快照。",
    success: "課程出現在課程設定清單，狀態與扣抵預設正確，並可用於新增排課。",
    details: ["適用範圍：下列課型、點數及預設值是原課程範本流程；已啟用新版運動把教學項目與收費方式分開管理，教學項目不等於售價或學員持卡，請依 C172 建立，不把舊範本欄位套到新版。", "團課與私課是必填課型；點數卡依每人點數扣抵，堂數卡每人每堂使用 1 堂。", "可勾選多筆批次上／下架；只有店長可刪除完全未使用的項目，已有方案、教練資格、排課或歷史時會整批阻擋，請改用下架。"],
    permission: "booking.create", additionalPermissions: ["booking.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/workspace.tsx", "src/lib/course-scheduling.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C108",
    "category": "booking",
    "title": "如何新增空間並設定容納人數？",
    "summary": "建立空間名稱、位置與容量後會原地加入清單，不必等待整個課表工作台重新載入。",
    "answer": "空間容量是排課警示；租借另設定每小時租金與前後緩衝，不會自動增加課程名額。",
    "keywords": "新增教室 教室管理 新增空間 空間管理 空間 剛新增 查看新空間 儲存失敗 重試 場地 容量 設備 位置 停用 批次 刪除 新版運動 分鐘租借",
    "path": "店務管理 → 空間管理 → ＋ 新增空間",
    "steps": [
      "輸入空間名稱、分類與容納人數，可補位置、設備及備註。",
      "只送出一次；成功後新空間會原地標示「剛新增」，即使目前篩選不符也可按「查看新空間」，不用清空搜尋。",
      "重新進入空間清單確認啟用，再到排課選單核對可選用及該堂課的人數上限。"
    ],
    "important": "空間已有未結束課次時，不能直接停用；縮小容量也不能低於仍在使用的排課需求。",
    "success": "空間出現在空間管理與排課選單，名稱、容量及狀態正確。",
    "details": [
      "同一空間的課程與租借時段會互相檢查；空間容量較小時系統會提示，但課程本身的人數上限仍需另行設定。",
      "儲存期間欄位與關閉會受保護；失敗保留草稿，結果不明先重開清單核對，再用原畫面重試。相同請求不會重複建立，同名空間仍會拒絕。",
      "開放租借可設定每小時租金及前後緩衝；原租借以 30 分鐘單位，新版運動可依更精細分鐘數按時租比例核對，操作見 C161，不因此增加課程名額。",
      "可勾選多筆批次啟用／停用；只有店長可刪除完全未使用的空間，使用中或有歷史關聯時整批不刪除。"
    ],
    "permission": "booking.create",
    "additionalPermissions": [
      "booking.read"
    ],
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/courses/workspace.tsx",
      "src/app/(dashboard)/dashboard/courses/rooms-page.tsx",
      "src/components/admin/use-course-room-create.ts",
      "src/server/actions/course.ts"
    ],
    "kind": "howto",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C109", category: "booking", title: "怎麼一次排單堂、每週或多個指定日期？",
    summary: "選課程、教練、教室與日期，先看預覽再整批建立。", answer: "每週重複與指定日期都會整批檢查；其中一堂衝突時整批不建立。",
    keywords: "新增排課 批次排課 每週 重複 指定日期 複製 預覽 衝突 課表更新 60秒 背景同步 草稿保留", path: "課表排程 → 新增排課／複製課程",
    steps: ["選課程、教練、教室、開始時間與人數上限。", "選單堂、每週至某日，或加入其他指定日期，再執行排課預覽。", "逐筆核對日期、營業時間、值班、教練與教室衝突後，確認建立。"],
    important: "預覽通過不保證稍後仍可儲存；正式送出會在鎖定店家資料後重新檢查全部日期。",
    success: "顯示建立堂數，所有日期都出現在課表；不會只建立無衝突的一部分。",
    details: ["同一教練或教室時段重疊、超出營業時間、值班未涵蓋或資源停用都會阻擋。", "重送同一請求不會建立重複課次；若資料已變更，請重新開啟表單。", "原課表在頁面可見、沒有編輯或交易進行時每 60 秒背景更新；關閉日期面板仍會更新，切回頁面也會檢查，短時間重複焦點事件會合併。開著排課編輯、課程名單視窗、有未儲存內容、處理中或結果未明時會暫停父課表更新；保留草稿，關閉後再核對，不代表資料即時推播或已儲存。本題的每週至某日／指定日期是有限批次；已啟用新版運動的每週／隔週固定是永久系列，不填本次堂數，另見 C173。已啟用新版運動的原課表與名單在安全閱讀時，前次讀取完成後約 3 秒安排下次更新；隱藏分頁、編輯、提交或結果未明時暫停，失敗會延長重試間隔，恢復後再回到約 3 秒。這是輪詢，不是即時推播或送達時限；舊課表仍依原 60 秒節奏。"],
    permission: "booking.create", additionalPermissions: ["booking.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/workspace.tsx", "src/server/actions/course.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C110",
    "category": "booking",
    "title": "排好的課程要改時間、容量或取消，先看什麼？",
    "summary": "先看有效預約與點名狀態，再決定修改單堂、後續系列或取消。",
    "answer": "已有預約或完成點名時，部分欄位會被保護，不能直接覆蓋歷史。",
    "keywords": "修改排課 改時間 改教練 改教室 容量 取消課程 系列 後續課次 核對取消範圍 僅取消本堂 本堂及後續停課 剪下貼上",
    "path": "課表排程 → 選課程 → 編輯／取消",
    "steps": [
      "打開課次，核對日期、學員數、點名狀態及它是否屬於系列。",
      "依畫面選修改單堂或後續系列，重新核對教練、教室、容量與時間。",
      "預覽並儲存；若要取消，先確認有效預約會如何處理，再查看課表與學員紀錄。"
    ],
    "important": "已完成點名的課次保留歷史不可修改；有預約時不能把容量調到低於人數，也不能改每人點數或課程種類。",
    "success": "指定範圍的課次更新或取消，其他課次不受影響，原預約與額度紀錄一致。",
    "details": [
      "適用範圍：原課程系列與新版運動永久固定課分開判斷。新版移動本堂不改其他固定課；本堂停課與本堂及後續停課的範圍不同，核對確認內容及日期。原位淡化不代表系列已刪除，也不可另建重複固定系列；詳見 C173。",
      "改期若超過學員方案期限會被阻擋；教練、教室、營業時間與值班會重新檢查。新增課次或變更日期、時間、教練時，運動課也會檢查教練每週可授課時段。",
      "只改名稱、備註等資料不重查原時段；縮短教練每週時段也不會自動取消已排課，請依畫面清單逐堂處理。",
      "取消整堂課與只取消一位學員不同；取消也不等於退款。新版運動固定／隔週課只移動本堂時，其他課次維持原安排，原位置淡化且可排單次，但不能再建立重複固定系列；單次、體驗、出租不因此留下固定課淡化位置。",
      "新版運動「取消課程」先讀取範圍：僅取消本堂顯示人數；本堂及後續停課另列生效日、已排堂數及預約數，也結束尚未展開的後續時段。有出席或缺課紀錄會阻擋；名單已變動時重新核對，不以舊確認送出。已收款不自動退款。",
      "新版剪下貼上的結果核對與原紀錄保護見 C175；剪下不代表課程已移動。"
    ],
    "permission": "booking.update",
    "additionalPermissions": [
      "booking.read"
    ],
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/courses/workspace.tsx",
      "src/server/actions/course.ts"
    ],
    "kind": "troubleshooting",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C111", category: "plans", title: "如何建立點數或堂數方案？",
    summary: "選額度單位、額度、售價、成本、效期與適用課程，再決定是否上架。", answer: "點數方案按課程點數扣抵；堂數方案每位學員每堂使用 1 堂，固定期課另需連結指定課次。",
    keywords: "新增方案 點數 堂數 售價 店家成本 有效天數 適用課程 顧客可購買 僅後台指派 允許共卡 上架 下架 固定期課", path: "店務設定 → 方案管理 → ＋新增方案",
    steps: ["輸入方案名稱，選點數或堂數，填額度、售價、店家成本與有效天數。", "勾選適用課程，再選「顧客可購買／僅後台指派」及是否允許共卡；固定期課需連結與堂數相同的未開始課次。", "選上架或下架後儲存，回到清單核對額度單位、使用方式、成本、期課與狀態。"],
    important: "已開通新版運動工作區的店家請以 C172 的「收費方式」核對教學項目、教練及額度；本題保留原方案管理流程。原固定期課連結堂數不是新版永久系列的延續條件，排課見 C173；建立收費不等於發卡、收款或保留未來全部額度。一般販售方案不提供首次體驗與體驗價欄位；體驗收款請用收款與體驗設定及體驗預約流程。修改方案預設不會改動已指派卡片，也沒有自動續費。",
    success: "方案出現在清單，額度單位、價格、效期、適用課程與狀態正確。",
    details: ["下架只阻止後續選購或指派，不會刪除既有卡片及歷史；「僅後台指派」只限後台結帳。成本用於本次結帳分配與低於成本阻擋。", "首次體驗不是一般方案的使用方式；舊內部體驗資料會保留，但新增／編輯普通方案不顯示體驗開關，避免把販售卡誤當體驗。", "只有勾選允許共卡的方案可新增授權成員；堂數卡不使用課程點數，固定期課另受指定課次限制。"],
    permission: "plans.edit", additionalPermissions: ["wallet.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/member-workspace.tsx", "src/server/actions/course-members.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C112", category: "plans", title: "店內購買方案並結帳，怎麼處理？",
    summary: "選顧客、方案、效期與本次開發人，再核對優惠、實收及收款方式。", answer: "「購買方案」確認結帳會同時完成發卡、購買與收款登記；全額折抵保留購買與方案，但不建立收入。",
    keywords: "指派方案 購買方案 確認結帳 現金抽屜 重新確認 折扣 打折 折抵 轉帳 後四碼 店家成本 開發人 交易更新 背景同步 原交易", path: "顧客管理 → 顧客詳情 → 持有方案 → 購買方案",
    steps: ["從顧客詳情點「購買方案」（原指派方案），核對學員、上架方案、效期與本次開發人。", "選優惠與已收款方式；轉帳填後四碼。現金且實收大於零時，先等畫面確認今日現金抽屜已開啟。", "抽屜未開時可另開新分頁處理，回來按「重新確認」；若已結帳先依權限處理，不改填別種付款方式繞過。", "核對實收後點「確認結帳」一次，看到「結帳完成，方案已加入」，再查持有方案與原交易。"],
    important: "這個按鈕會同時發卡並登記收款，不是單純增加額度。連線中斷先查原交易，不要直接重按。",
    success: "只新增一張卡、一筆購買與一筆對應收款；顧客、效期、實收與本次開發人快照正確。",
    details: ["從顧客進入時會帶入其所屬店長作為本次開發人，可依實際成交調整；沒有用核帳人自動代替。使用折扣另需折扣權限。", "實收不能低於店家成本；成本為 0 的全額折抵不要求付款方式，也不建立收入。現金需今日抽屜已開啟。", "結帳成功後，營收、交易與現金頁會重新取得資料；已開著的其他裝置不是即時推播。若清單尚未反映，先重開原交易、核對原卡片與收款，不要重新購買或換付款方式重做。背景資料更新失敗不會把已成功結帳變成失敗。"],
    permission: "wallet.create", additionalPermissions: ["transaction.create", "customer.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/member-workspace.tsx", "src/components/admin/course-assignment-payment.tsx", "src/server/actions/course-checkout-status.ts", "src/server/actions/course-members.ts", "src/server/services/course-assignment-checkout.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C113", category: "money", title: "會員線上回報轉帳後，店家如何核帳？",
    summary: "在待核帳區核對顧客、方案、金額與轉出帳號後四碼，再確認收款並啟用。", answer: "會員回報轉帳只建立待核帳購買；店家確認後才發卡與啟用額度。",
    keywords: "線上購買 待核帳 轉帳 後四碼 確認已收款 啟用方案", path: "方案管理 → 線上購買待核帳 → 核帳",
    steps: ["找到待核帳購買，核對顧客、方案、金額與轉出帳號後四碼。", "先查實際入帳，再點核帳並二次確認「確認已收款並啟用」。", "看到已核帳訊息後，核對顧客卡片、額度與交易紀錄。"],
    important: "後四碼相符不等於款項一定入帳；未查帳前不要啟用，也不要因連線中斷直接重按。",
    success: "待核帳項目消失，方案卡啟用且只新增一次額度與購買紀錄。",
    details: ["同一購買請求只能核帳一次；若畫面中斷，先重新整理查結果。", "這個流程是課程模組購買，與蒸足方案付款確認頁分開。"],
    permission: "wallet.create", additionalPermissions: ["wallet.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/purchase-review.tsx", "src/server/actions/course-portal.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C114",
    "category": "staff",
    "title": "新增教練或教師後，為什麼還不能排課？",
    "summary": "後台帳號與授課身分分開；新版運動還要在教學項目完成授課資格，計酬可沿用項目預設或個別覆寫。",
    "answer": "先建立並啟用教練，再到教學項目勾選授課資格；有薪酬權限者可在教練授課設定沿用項目預設，或設個別拆帳、鐘點及每堂固定費。音樂流程詳見「音樂教師如何設定可教課程、拆帳比例及 LINE 權限？」。",
    "keywords": "新增教練 新增老師 統一人員工作區 教師管理 人員管理 身分分離 授課資格 可教授課程 目前課程 其他項目 停用 未販售 每堂固定費 拆帳 LINE 權限 工作權限 店長兼教練 同一人連結 資料已更新 費率衝突 授課明細 授課時間 新版運動 固定鐘點 沿用教學項目預設 個別計酬 同名教練",
    "path": "人員管理 → 教練／教師 → 新增／編輯 → 基本資料／授課設定／LINE 與權限／課表與時間",
    "steps": [
      "到人員管理的教練／教師分頁新增授課身分，在「基本資料」填必要欄位；生日與緊急聯絡等選填內容收在更多資料，不要用後台人員帳號代替授課身分。",
      "切到「授課設定」核對可教授課程；新版運動先完成教練基本資料，再到教學項目勾選可授課教練。若有計酬權限，在教練授課設定選沿用項目預設或個別費率（C172、C176）。",
      "到「LINE 與權限」核對帳號，依需要開啟查看本人薪酬、代學員請假或替學員改期；再從「課表與時間」查看已排課次與可授課時間，儲存後回課表確認能選到該授課人員。"
    ],
    "important": "授課身分不會自動取得店長後台權限；店長與教練是兩筆獨立身分，同一人可選擇連結，但登入、權限與歷史仍分開。",
    "success": "排課可選到該教練／教師，課程資格與費率正確；LINE 綁定與權限狀態依後台設定顯示。",
    "details": [
      "授課設定預設只列目前課程；已選的舊項目仍保留，其他停用或未販售項目可從「其他項目」展開。顯示名稱簡化不會改課程 ID、方案或財務規則。",
      "停用或移除授課資格前，先處理尚未結束的課次與交接清單；新費率只套用之後排出的課次，不回寫既有課次快照。",
      "每週可授課時段儲存後，既有課次會保留並列出超出新範圍者；單日請假仍須另外處理。通知是否發送由提醒管理的三個獨立開關控制。",
      "只有店主且具人員管理權限可管理此頁。原運動每堂固定費設定 0 元表示不另領固定授課費；音樂老師依拆帳規則另行計算，完整後台操作見「音樂教師如何設定可教課程、拆帳比例及 LINE 權限？」。",
      "若調整費率時顯示資料已更新，代表別人已先修改；重新開啟核對後再存，系統不會用舊頁覆蓋新費率。新增或編輯成功後留在原視窗並更新清單，失敗時保留草稿，不要重複建立。",
      "舊資料若顯示店長兼任，請先另建授課身分並核對同一人連結與交接；系統不會自動合併或刪除舊身分。後台設定對教師工作功能的影響可在此說明，但前台操作指南已退役。",
      "新版運動先完成教練基本資料，再到教學項目完成對應授課資格；同名教練要依實際人員重新選取，不能只靠顯示名稱猜同一人。排課仍找不到時，重開教學項目核對所選教練，不重建同名帳號。",
      "新版運動的教學項目保存共用計酬預設；教練可選沿用，或個別設拆帳、固定鐘點、每堂固定費。0 是明確費率，不是沿用；詳見 C176。原運動與音樂費率仍按各自流程，不混用。",
      "新版運動的「授課明細」查看已排課，「授課時間」修改可授課時段；音樂及舊版仍可能顯示「課表與時間」。修改時段不會自動取消舊課。"
    ],
    "references": [
      {
        "guideId": "C169",
        "label": "音樂教師如何設定可教課程、拆帳比例及 LINE 權限？"
      }
    ],
    "permission": "staff.manage",
    "additionalPermissions": [
      "staff.view"
    ],
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/courses/staff-workspace.tsx",
      "src/server/actions/course-staff.ts"
    ],
    "kind": "troubleshooting",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C115", category: "analysis", title: "課程分析的上課、收款與回流數字怎麼看？",
    summary: "先選期間與分析對象，再分開看來客人次、去重人數、成交、收款與近六個月營收結構。", answer: "來客人次按完成出席堂次累加；方案與體驗收退款按入帳時間，營業額、收支結餘與出席不能直接當成同一數字。",
    keywords: "營運分析 報表 匯出 CSV 來客人次 不重複人數 所屬店長 教練 回流率 上月顧客回流 已回訪 尚未回訪 已有預約 搜尋姓名電話 收款 營業額 營收結構 收支結餘 近六個月 近一年", path: "分析 → 營運分析",
    steps: ["選今日、本月或自訂日期，確認頁首台灣時間範圍，再選店家、所屬店長或教練。", "在顧客回流區先讀基準月份、回訪期間與截至狀態；展開「已回訪／尚未回訪」可搜尋姓名或電話，尚未回訪者另標示是否已有預約。", "分開查看來客人次、體驗、新卡、續卡、收款、利潤與授課費；在店家視角查看固定近六個月的營業額與收支結餘，具權限者再匯出 CSV。"],
    important: "同一人同日上兩堂計 2 人次；「不重複來客人數」才是期間去重。團體同堂有兩位實際出席就計 2 人次。回流率的基準群與回訪區間不可混用。",
    success: "所選期間、比較期間與各區塊口徑一致，匯出檔使用相同日期範圍。",
    details: ["方案依核帳／退款日，體驗依收款／沖銷日；所屬店長的出席依顧客目前歸屬，成交依購買時快照，未指定列未歸屬。", "回流分析以觀察期前一個月有完成上課的顧客為基準群：選本月時顯示「上月顧客回流」並觀察到今天；自訂期間則用起始日前一個完整月作基準。每位顧客只計一次。", "名單每頁 20 人；清單開合與搜尋只改顯示，不更改顧客、預約或回流數。頁面在可見且超過 60 秒、跨日或重新取得焦點時更新。", "查看金額、顧客名單、授課費、收支及匯出各受額外權限控制；沒有權限時不顯示，不代表資料為零。共用財務圖固定近六個月、本月統計至今日，上方日期只影響摘要；原課程趨勢依其頁面期間說明。"],
    permission: "report.read", feature: "basic_reports", sources: ["src/app/(dashboard)/dashboard/courses/analytics-page.tsx", "src/server/queries/course-analytics.ts"], kind: "explanation", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C116", category: "money", title: "課程體驗的收款、出席與作廢為什麼要分開？",
    summary: "先登記體驗收款，再依實際上課狀況點名；兩個動作互不代替。", answer: "收款不會自動完成出席，出席也不會再次收費或使用其他方案額度。",
    keywords: "體驗 收款 混合付款 報到 出席 作廢 沖銷 更正 無卡 未收款 已收", path: "課表排程 → 上課名單 → 體驗學員列的收款／點名",
    steps: ["在體驗學員列核對金額與未收款標示，點旁邊的「收款」登記實際付款；已收者顯示已收金額。", "學員到場及課程結束後，另依實際狀況操作報到、出席或未到。", "收款登記錯誤時使用更正收款或作廢，填原因後核對歷史與收支；不要用取消預約代替帳務更正。"],
    important: "作廢只沖銷收款，保留原紀錄及出席狀態；系統不會自動銀行退刷。",
    success: "付款狀態、出席狀態及收支紀錄各自正確；體驗沒有建立方案額度異動。",
    details: ["體驗預約無卡且每人點數為 0；已支付的同堂出席不再扣其他方案。", "重送同一收款不會重複入帳；連線中斷時先查原紀錄再決定是否重試。"],
    permission: "booking.read", additionalPermissions: ["trial.confirm"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/roster.tsx", "src/server/services/course-trial-payment.ts"], kind: "explanation", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C117", category: "customers", title: "會員登入後看不到本店課程或方案，先查什麼？",
    summary: "先確認從正確課程店入口登入，再分開核對中央會員、本店顧客連結與通知 LINE。", answer: "中央會員可協助首次確認本人，但課程會員資料仍按店別連結；同名、同電話或其他店已連結不會自動取得本店資料。",
    keywords: "會員登入 看不到課程 看不到方案 中央會員 首次確認 帳號尚未連結 本店顧客 本店會員連結 LINE 店別 身分衝突 本店會員與LINE 確認碼 已核對本人 確認綁定 已連結 確認通知連結", path: "顧客管理 → 顧客詳情 → 本店帳號與 LINE 連結",
    steps: ["在後台確認目前店家，搜尋既有學員並核對中央會員、本店帳號／LINE 連結。", "查持有方案的狀態、適用課程、效期與授權；不要因登入後看不到就新增重複顧客或方案。", "遇帳號尚未連結或身分衝突，保留提示並依本人確認流程核對，不以姓名電話或其他店連結猜測覆蓋。"],
    important: "不要為了排錯解除其他人的 LINE、重建同名顧客，或把其他店的會員資料直接搬入。",
    success: "會員重新進入本店入口後，可看到屬於本店且已授權的課程、預約與方案。",
    details: ["共卡授權只開放使用該卡預約，不會開放其他成員健康資料。", "教練若只開放工作身分，會員操作可能被停用；店家需在工作入口與會員連結設定核對。", "本店會員與 LINE 有待確認申請時，由具顧客修改權限者核對本人及手機確認碼，再選「已核對本人，確認通知連結」；成功立即顯示已連結，原有唯一會員可沿用，不另建重複學員。這是本店連結申請流程，不是蒸足一般聊天室手機通知綁定；共享官方 LINE 不能只憑手機猜門市。通知資格與登入身分仍分開。", "已有中央會員或 LINE 帳號不代表已連結本店顧客；首次確認只建立經核對的本店連結，不會合併其他店的方案、預約或通知資格。尚無帳號或 LINE 關聯的新學員，首次登入僅在姓名及手機都符合唯一名單且無其他關聯時可沿用；已有身分或通知綁定者不套用。身分衝突需人工核對，保留查核編號，不用同名同電話直接覆蓋。"],
    permission: "customer.read", feature: null, sources: ["src/app/(customer)/book/course-portal.tsx", "src/server/services/course-access.ts", "src/server/services/course-line-onboarding.ts", "src/components/admin/store-member-connection-panel.tsx", "src/server/services/store-member-connection.ts"], kind: "troubleshooting", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C118", category: "plans", title: "共卡成員要怎麼新增或移除？",
    summary: "先打開顧客持有方案，再搜尋並儲存同店授權成員。", answer: "共卡成員共享同一張卡的可用額度；固定期課不開放共卡。",
    keywords: "共卡 授權成員 新增成員 移除成員 搜尋顧客 占用 固定期課 功能未開通 隱藏 鎖定", path: "顧客管理 → 顧客詳情 → 持有方案 → 方案與共卡",
    steps: ["打開顧客的持有方案，選正確卡片並等待詳細資料載入完成。", "在共卡授權成員輸入姓名或電話；明確點選正確候選再勾選，搜尋框按 Enter 不會自動選第一位。", "儲存後重新開啟，核對成員、剩餘、已預約占用與可用額度。"],
    important: "移除成員前先處理該成員或代約人的有效預約；系統會阻擋留下無權使用卡片的預約。",
    success: "卡片只保留正確同店成員，原額度與使用紀錄沒有被重建。",
    details: ["搜尋只會回傳部分結果，必須選到實際顧客，不能只輸入姓名；共卡不開放彼此健康資料。", "固定期課綁定指定學員與課次，不能加入共卡成員；請另購自由預約方案。", "運動共卡由總部獨立開通；HIDDEN 時不顯示共卡操作，LOCKED 時只保留既有授權與預約的查看、使用及取消，不能新增成員或同行。"],
    permission: "wallet.create", additionalPermissions: ["wallet.read", "customer.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/member-workspace.tsx", "src/components/admin/course-customer-picker.tsx", "src/server/actions/course-members.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C119", category: "plans", title: "固定期課方案怎麼建立與指派？",
    summary: "使用堂數方案，連結與販售堂數相同的未開始課次。", answer: "固定期課結帳時一次預約全期；未到仍扣堂，不能改用其他課次或共卡。",
    keywords: "固定期課 期課 整期預約 指定課次 堂數 未到扣堂 補課券", path: "方案管理 → 新增／編輯方案 → 期課：連結指定課次",
    steps: ["建立堂數方案，設定販售堂數與適用課程。", "展開期課設定，選擇相同堂數、尚未開始且互不重疊的課次後儲存。", "指派並結帳時核對固定期課堂數；完成後確認整期課次都已預約。"],
    important: "任一堂預約失敗時整筆不發卡、不收款也不保留部分預約。已有購買紀錄的期別不可直接改課次。",
    success: "卡片顯示指定課次，整期預約數等於方案堂數，名單可辨識第 N／共 N 堂。",
    details: ["固定期課不能共卡；預約只限方案指定課次。未到仍扣 1 堂，更正未到會返還，沒有補課券。", "要更換已有購買的期別，請建立下一期新方案，保留原購買與課次歷史。"],
    permission: "plans.edit", additionalPermissions: ["booking.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/member-workspace.tsx", "src/server/services/course-term.ts", "src/server/services/course-assignment-checkout.ts", "src/server/services/course-booking.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C120", category: "care", title: "每個課程方案的低額度與到期提醒怎麼設定？",
    summary: "在提醒管理逐一設定低額度門檻與到期前天數，再一次儲存。", answer: "每張卡依可用額度與該方案的天數判斷；到期提醒還需要總開關啟用。",
    keywords: "低額度提醒 到期提醒 方案提醒 門檻 到期天數 14 7 可用額度", path: "設定 → 通知與顧客經營 → 提醒管理 → 顧客提醒",
    steps: ["搜尋方案，勾選低額度提醒並填門檻。", "勾選到期提醒，輸入逗號分隔的天數，例如 14, 7；確認上方到期提醒總開關已開。", "儲存後用預覽核對方案名稱、單位、提醒階段，以及立即預約、購買／續購與諮詢店長操作。"],
    important: "預覽是示意，不會證明 LINE 已送達；隔離預覽不向外發送。",
    success: "頁面顯示所有設定已儲存，重新開啟後各方案門檻與天數仍正確。",
    details: ["低額度用剩餘扣除已預約占用後的可用額度判斷；額度用完與低額度使用不同通知階段。", "到期天數限 1–365 天、最多 6 次；更改天數不補發已錯過階段，也不會變更方案期限。", "預覽按鈕要與實際訊息一致，但預覽不送出訊息，也不能替代真人 LINE 操作驗收。"],
    permission: "business_hours.manage", feature: "line_reminder", sources: ["src/app/(dashboard)/dashboard/courses/reminders/low-balance-settings.tsx", "src/server/actions/course-plan-reminders.ts", "src/server/services/course-expiry-reminders.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C121", category: "care", title: "首頁顯示「未指派方案」，要怎麼處理？",
    summary: "打開站內待辦名單，核對顧客後再進顧客頁購買方案。", answer: "這是尚無本店課程方案紀錄的站內待辦，不會自動傳 LINE，也不代表顧客欠款。",
    keywords: "未指派方案 顧客方案待辦 沒有方案 站內提醒 不發LINE", path: "首頁 → 顧客方案待辦；設定 → 通知與顧客經營 → 未指派方案提醒",
    steps: ["打開未指派方案名單，核對姓名、電話末四碼、建檔日與所屬店長。", "進入顧客詳情查既有卡片、待核帳與歷史，避免重複購買。", "確定需要購買時點「購買方案」，依實際收款「確認結帳」；返回名單重新整理。"],
    important: "不要把名單當成催款名單或直接群發通知；本功能目前只讀、不自動建立方案或交易。",
    success: "完成有效指派後重新整理，該顧客移出名單；未處理者仍保留。",
    details: ["已有共卡成員、待核帳、已核帳／退款訂單、到期／用完／結清卡或持卡預約歷史者不列入；純教練帳號也排除。", "名單沿用店別與所屬店長可見範圍，需要顧客與方案查看權限；查詢失敗不顯示假零人。"],
    permission: "customer.read", additionalPermissions: ["wallet.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/unassigned-plans/page.tsx", "src/server/queries/course-unassigned-plans.ts", "src/app/(dashboard)/dashboard/courses/settings-workspace.tsx"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    "id": "C122",
    "category": "money",
    "title": "教練每堂授課費如何登錄已付或更正？",
    "summary": "在收入總覽依期間展開授課費，核對已結束課次後登錄。",
    "answer": "授課費依課次保存的計酬版本核對；原每堂固定費、新版運動拆帳／鐘點與音樂規則分開，登錄已付不是自動匯款。",
    "keywords": "授課費 教練費 每堂固定 待付 已付 登錄已付 更正誤登 支出 新版運動 拆帳 固定鐘點 版本快照",
    "path": "營運 → 收入總覽 → 授課費 → 展開明細",
    "steps": [
      "選日期範圍展開授課費，核對課次、教練、計酬版本及付款狀態。",
      "在待付課次點登錄已付，選現金或非現金並填付款備註後確認。",
      "若只是誤登，點更正誤登並填原因；另行確認實際匯款或款項收回。"
    ],
    "important": "登錄或更正都不是銀行付款／退款。現金付款需今日抽屜已開啟；連線中斷先重新整理查結果。",
    "success": "付款狀態與備註正確，現金帳有對應支出；更正保留原付款及反向沖回紀錄。",
    "details": [
      "原運動課依每堂固定費；只有已結束、未取消、費率為正且教練與快照一致的課次可登錄，0 元表示不另領。音樂老師另依老師／科目／方案的拆帳或固定費快照計算。",
      "舊課次缺費率或金額無法證明時會標成待核對；單次最多顯示 100 堂，超過時需縮短日期範圍。",
      "新版每月收入結算不再提供新增利潤付款入口；授課費付款仍從營運處理。音樂授課費可分次登錄，但每次不得超過未付餘額；月結與營運共用同一付款紀錄，不要重複新增支出。",
      "已啟用新版運動可依收費方式保存拆帳或每小時鐘點，詳細核對見 C176；不能把所有運動課都當成每堂固定費。可登錄仍受課程結束、取消、應付金額及快照限制，不回算舊課。"
    ],
    "permission": "cashbook.read",
    "additionalPermissions": [
      "cashbook.create"
    ],
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/_components/course-fees.tsx",
      "src/app/(dashboard)/dashboard/revenue/_components/course-fee-payment-button.tsx",
      "src/server/services/course-fee-payment.ts"
    ],
    "kind": "howto",
    "modules": [
      "course"
    ],
    "verification": "source-reviewed"
  },
  {
    id: "C123", category: "settings", title: "課程店的設定入口怎麼找？未儲存草稿會消失嗎？",
    summary: "設定分為五區；六步引導依模組顯示實際進度，新版運動先建教練、再設教學項目資格與收費，細項沿用既有側邊／滿版面板。", answer: "設定進度只引導店家完成必要資料；稍後提醒或不再顯示會立即移除提示，但不會替你改設定，草稿也仍須明確儲存。",
    keywords: "課程設定 五分類 側邊面板 手機滿版 草稿 未儲存 已保留草稿 店家資料 營業 收款 通知 提醒管理 排課模式 開放選課 指定學員 目前分頁 獨立載入 讀取回饋 隱藏 鎖定 啟用 系統方案 候補 店長通知 LINE額度 Email 工單待取件 查看訊息預覽 通知分類 下拉選單 設定提醒 收合 精簡列 Flex 示範資料 7種 教師 老師 教學項目 班型與學費 後台異動通知 預設開啟 提示音", path: "設定",
    steps: ["桌機從左側、手機從設定分類選單切換店家資料、營業與預約、收款與體驗、通知與顧客經營、系統方案與用量。", "直接編輯目前區塊；營業、公休、提醒等細項會在桌機側邊面板或手機滿版面板開啟，候補也在營業與預約區。", "確認未儲存標記後逐區儲存；要離開或關閉時依提示繼續編輯或捨棄。"],
    important: "顯示「尚未儲存 · 已保留草稿」不等於已寫入系統；網路失敗後也要確認成功訊息與重新開啟結果。若顯示已儲存但其他頁面同步失敗，原設定已寫入，請保留畫面並重新整理核對，不要重複送出。",
    success: "重新開啟後資料仍正確，未儲存標記消失，關閉視窗回到原設定分類。",
    details: ["新版運動六步依序為營業時間與公休、空間、教練基本資料、教學項目與授課資格、收費方式、第一堂課。第三步只需啟用教練；第四步須上架教學項目並選至少一位可授課教練；第五步核對指定項目方案或開放選課通用卡。音樂與舊課程維持原順序。", "音樂與舊課程的「開始設定」依設定營業時間與公休、新增空間、建立課程、建立方案、教練與授課課程、排第一堂課六項顯示進度；音樂店改稱教學項目、班型與學費、教師。已有但未啟用的項目提示修正，不必重建資料。", "選稍後提醒或不再顯示會先在畫面立即移除該提示；若儲存失敗會恢復原項目並顯示錯誤。這只改引導顯示，不改業務設定；銀行資料、LINE 與授課費另依需求設定。", "提醒管理只載入目前分頁所需資料，不重新整理整個後台版面；切換時保留讀取回饋，晚到的舊資料不會蓋掉新分頁。仍顯示讀取中或讀取失敗時不要把空白當成沒有設定，可按重新讀取。總部檢視按真實 HIDDEN／LOCKED／ENABLED 資格顯示，不假造可用入口。", "店長通知的人員列預設精簡顯示；點「設定提醒」後用通知分類下拉選單調整各項開關，說明與訊息預覽預設收合。各開關獨立儲存，不必等待整頁重新整理。", "店長通知上方另有 LINE 額度 Email 通知，寄給本店所有啟用中老闆的登入信箱；它與店長 LINE 綁定、七種 LINE 事件分開，操作見 F13。工單功能開通時才顯示工單取件提醒，操作見 W06。", "儲存中的表單不能捨棄；關閉視窗、遮罩、Escape 與視窗內導覽會先處理草稿。沒有草稿或儲存作業時，關閉後直接回原設定位置，不需等伺服器重載；重新開啟仍按目前店別與權限讀取。成功後會收合已確認的編輯區；若寫入成功但其他頁面同步失敗，編輯區會保留並顯示核對提示。四模組共同判讀見 I21。", "部分顧客／方案完整表單會保留未送出的輸入；同帳號、同店、同一瀏覽器分頁最多暫存 8 小時，明確登出會清除，且不會跨裝置同步。", "入口仍受角色、權限、功能開通與總部檢視模式限制；看不到項目不代表設定被刪除。", "要看店長 LINE 卡片，到「通知與顧客經營 → 提醒管理 → 店長通知」展開預設收合的「查看訊息預覽」，用「通知類型」切換。運動／音樂共有 7 種：當日新預約、數位管家新名單、要求真人客服、真人客服催辦、待確認付款、出席待處理及每日待辦摘要；不含蒸足新體驗預約與 VIP 續購需求。", "畫面使用示範資料，預覽按鈕不跳轉業務操作、不發 LINE；切換或收合不會啟用通知，不需建立真實預約或收款。實際 LINE 排版、收件與按鈕目的地仍要另行核對。", "店長預覽與顧客 LINE 提醒用途不同；顧客提醒按鈕的用途與後台結果核對見 C167。店長發送失敗及舊文字重試的判讀見 F04。", "課程店的後台異動通知與提示音目前預設開啟；可分別在設定及頂欄鈴鐺內關閉。鈴鐺的待處理、已處理、載入與權限規則見 C170。"],
    references: [{ guideId: "C177", label: "如何設定開放選課與指定學員？" }, { guideId: "C170", label: "課程門市異動通知如何查看、處理或復原？" }, { guideId: "F13", label: "LINE 訊息額度快用完時，如何設定 Email 通知？" }],
    permission: "booking.read", feature: null, sources: ["src/app/(dashboard)/dashboard/courses/settings-workspace.tsx", "src/app/(dashboard)/dashboard/courses/settings-panel.tsx", "src/components/admin/settings-panel-context.tsx", "src/components/operations/operation-scope.tsx", "src/lib/operation-state.ts", "src/app/(dashboard)/dashboard/courses/reminders/page.tsx", "src/app/(dashboard)/dashboard/courses/reminders/course-reminder-view.tsx", "src/app/(dashboard)/dashboard/reminders/reminder-panel-reader.tsx", "src/app/(dashboard)/dashboard/reminders/line-notification-recipients-card.tsx", "src/app/(dashboard)/dashboard/reminders/line-quota-email-setting.tsx", "src/app/(dashboard)/dashboard/reminders/manager-notification-preview.tsx", "src/lib/manager-notification-preview.ts", "src/lib/course-setup-progress.ts", "src/components/admin/course-setup-guide.tsx", "src/lib/course-display-text.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C124", category: "booking", title: "怎麼從課表替既有學員或新體驗客預約？",
    summary: "打開課次後選學員預約；找不到既有顧客時再切換建立新體驗客。", answer: "既有學員需選有效方案；新顧客可在名單直接建檔並建立未收款體驗預約。",
    keywords: "學員預約 新增體驗客 建立新顧客 有效方案 最快到期 直接預約 名單 滿班 強制加入 確認超額 過堂補登 已開始 已結束", path: "課表排程 → 打開課次 → ＋學員預約／＋體驗客",
    steps: ["打開正確日期與課次，選「＋學員預約」後搜尋姓名、電話或 LINE。", "選到既有學員後核對系統列出的可用方案；多張適用卡會優先帶入最快到期者，仍可手動更換。", "找不到顧客時切換建立新體驗客，填姓名、電話與體驗金額後確認；再回名單核對。"],
    important: "不要為找不到的人重複建檔；先改用電話或姓名搜尋。店家後台可為實際發生的課程補登已開始或已結束課次，但顧客端預約截止規則沒有放寬；體驗預約只保留名額，收款與出席仍分開處理。",
    success: "學員出現在正確課次名單；一般預約占用正確方案，體驗客顯示尚未收款。",
    details: ["沒有適用方案時先到顧客詳情「購買方案」並確認結帳，不能用不適用或已到期卡硬約；送出時系統仍會重查額度與容量。開課前也可依實際情況點名，仍須核對正確日期與學員。", "店家後台的補登不受顧客預約提前時間限制，適用一般學員與體驗客；仍會檢查重複報名、方案效期與額度、指定課次、公休日及容量。新增預約後還要依實際結果另行點名與收款。", "音樂課滿班時，具權限的店長可在看過警告後明確確認加入既有學員或體驗客；這不會提高公開名額，會員端也不能繞過滿班限制。重複報名、學員撞堂、方案效期與餘額仍會阻擋。", "新體驗客建檔需顧客建立及體驗預約權限；不會自動發卡或登記收款。"],
    permission: "booking.create", additionalPermissions: ["booking.read", "customer.read"], feature: null, sources: ["src/app/(dashboard)/dashboard/courses/workspace.tsx", "src/app/(dashboard)/dashboard/courses/roster.tsx", "src/server/actions/course-members.ts", "src/server/services/course-booking.ts"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
  {
    id: "C125", category: "plans", title: "會員如何用轉帳購買課程方案？",
    summary: "在會員專區選可購買方案，依店家銀行資訊匯款後填轉出帳號後四碼。", answer: "送出後只是待核帳；店家確認實際入帳，方案才會啟用。",
    keywords: "會員購買方案 線上購買 轉帳 後四碼 銀行資訊 待核帳 課程方案", path: "會員專區 → 購買方案",
    steps: ["選擇標示可購買且適用的方案，核對價格、額度、效期與店家銀行資訊。", "完成實際匯款後，輸入轉出帳號後四碼並送出一次。", "到購買紀錄查看待核帳；店家確認後，再到我的方案核對額度與期限。"],
    important: "送出回報不代表已付款完成或方案已啟用；查詢進度不要重複送出同一筆。",
    success: "購買紀錄出現一筆待核帳，核帳後才有一張有效方案卡。",
    details: ["只有上架且設為「顧客可購買」的方案會出現；僅供後台「購買方案」結帳使用的方案，不會因此開放會員自行購買。", "系統不會自動扣款；後四碼只供對帳，店家仍需查看實際入帳。舊資料欄位名稱雖保留，畫面與驗證均為四碼。"],
    permission: "customer.read", feature: null, sources: ["src/app/(customer)/book/course-portal-client.tsx", "src/server/actions/course-portal.ts", "src/app/(customer)/book/course-portal.tsx"], kind: "howto", modules: ["course"], verification: "source-reviewed",
  },
];
