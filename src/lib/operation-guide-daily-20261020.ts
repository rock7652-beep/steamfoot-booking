import type { OperationGuide } from "./operation-guide-types";

/** Backend-only instructions at main 8d717d5d. UI acceptance is recorded separately. */
export const dailyOperationGuides20261020: OperationGuide[] = [
  {
    id: "C174", category: "booking", title: "新版運動如何核對請假、曠課及取消錯誤標記？",
    summary: "從課表的出席狀況查當日紀錄；取消標記是恢復待點名，不是刪除學員或退費。",
    answer: "限已啟用新版運動，先核對日期、學員及扣抵紀錄，再決定是否更正原標記；不要重建預約或手動補點。",
    path: "新版運動 → 課表排程 → 選日期 → 出席狀況",
    keywords: "新版運動 出席狀況 請假 曠課 未到 取消標記 恢復待點名 操作人 固定課待補課 尚未扣堂",
    steps: ["在課表選正確日期，開啟「出席狀況」，核對學員、課程、請假／曠課與操作人。", "確認為誤標且有修改權限時，點該列 ×；先讀還回額度及回收補課資格的確認內容。只是查看請按「返回」。", "確認取消標記後，回原課次核對已恢復待點名、額度及補課紀錄；尚未收到確定結果時先重讀原紀錄，不再次點名來刷新畫面。"],
    important: "永久固定課先留位置，出席或未到結算時才核對有效適用方案；無足額方案會拒絕，尚未扣堂。永久固定課未到扣抵並保留待補課，不是一般 7 日補課券，也不是音樂團體請假規則。",
    details: [
  "一般待點名預約結算時，會重新核對同授課項目有效方案，依先買先扣選擇可用卡；已完成、期初來源及專用補課權益不任意換卡。無足額權益會拒絕，尚未記錄出席或扣堂；處理見 C179，不手動補點。",
  "原生運動名單的待點名圓圈直接送出出席，後端確認後才顯示勾選；已處理標記再點開恢復狀態、未出席不扣堂、未出席扣堂。右側更多操作另放學員資料、繳費與取消本堂／後續課程。名單剩餘與可用額度分開；固定學員的點名前核對方案不是已欠款。同教學項目的舊堂數卡須由既存項目關聯驗證，不能只按名稱或選到的售價方案判定；點數舊卡、效期、占用及共用資格仍依原規則。",
  "本視窗只列當日請假與曠課，不是完整出席名冊；正常點名仍在原上課名單。操作人顯示讀取失敗或未記錄時，不可猜測誰操作。",
  "取消曠課會依原扣抵返還並回收尚未使用的補課資格；補課券已使用或預約、請假已安排補課時會阻擋，先核對原補課，不能強制還點。",
  "曠課更正出席不再扣第二次；出席更正曠課保留原扣抵並核對補課資格。恢復待點名後，永久位置與課卡重新分開，下次結算再核對有效方案。",
  "全堂學員皆請假或曠課時可釋放當次時段並保留淡化提示；不代表整個固定系列已結束。單次、體驗、原固定期課與音樂仍按各自規則處理。",
  "本題不提供尚未接入可見入口的「固定學員／待補課」面板操作；需要安排補課或停課時先交管理者核對，不另建顧客、重複系列或自行發券。"
],
    success: "原紀錄、待點名狀態及扣還額度一致，沒有重複扣抵、補點或刪除歷史。",
    modules: ["course"], permission: "booking.update", additionalPermissions: ["booking.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: [
  "src/app/(dashboard)/dashboard/courses/workspace.tsx",
  "src/app/(dashboard)/dashboard/courses/sports-attendance-panel.tsx",
  "src/app/(dashboard)/dashboard/courses/roster.tsx",
  "src/server/actions/sports-attendance-evidence.ts",
  "src/server/services/course-booking.ts",
  "src/server/services/sports-permanent-series.ts",
  "src/server/services/course-item-attendance.ts",
  "src/lib/item-entitlement.ts"
],
  },
  {
    id: "C175", category: "booking", title: "新版運動剪下課程後，如何貼上與核對調課結果？",
    summary: "剪下只保留待調安排，確認貼上才送出；回應中斷時先查結果，不重送。",
    answer: "限已啟用新版運動，在原課次剪下後到目標時段貼上，確認日期、時間、時長、空間與教練；固定課本堂異動不改其他課次。",
    path: "新版運動 → 課表排程 → 開啟課次 → ✂ 剪下 → 目標時段 → 貼上／確認調課",
    keywords: "新版運動 剪下 貼上 確認調課 核對貼上結果 查看原課紀錄 原位淡化 月週日 撞期 扣抵已沖回",
    steps: ["開啟原課次，核對日期與學員後點「✂ 剪下」；系統先查調課條件，剪下本身不會移動或刪除課程。", "在月／週／日課表選可用目標時段，核對新日期、開始時間、時長、空間及教練，再點「確認貼上」。不繼續時返回課表，不送出。", "成功後核對課卡的新位置與原固定位置；若顯示「貼上結果待核對」，使用「核對貼上結果」，不要再送出同一調課。"],
    important: "已開始、仍有出席／曠課、未沖回扣抵、有效體驗收款或已付授課費時不能直接移動；先核對原紀錄，不為調課而任意沖銷真實交易。",
    details: ["單次／有限週數調課只處理選定課次；同一永久系列未選的其他日期仍會阻擋撞期。原固定位置淡化可安排單次，不可重建重複固定系列。", "若已完成合法更正與完整沖回，仍須重新剪下並通過伺服器核對；不能只憑畫面餘額或一句「已還點」判定可移動。", "結果核對只讀取實際位置，不重送交易；已到目標位置則確認成功，仍在原位才可修改後再確認。若位置已被別人改動，返回課表重新核對。", "撞期或超出營業／教練授課時間時，輸入及剪下狀態保留，可修改目標或返回選時段；原課已更新時使用「查看原課紀錄」。", "僅限已啟用新版運動；音樂與舊課程的「這堂／連續／換固定時段」範圍仍按原畫面，不套用新版按鈕。"],
    success: "確認後只有選定範圍移到目標位置，其他固定課次、歷史扣抵及收款未被重做。",
    modules: ["course"], permission: "booking.update", additionalPermissions: ["booking.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/workspace.tsx", "src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "src/app/(dashboard)/dashboard/courses/sports-move-confirm.tsx", "src/server/actions/course.ts", "src/server/services/sports-move-eligibility.ts", "src/lib/sports-move-policy.ts", "src/server/services/sports-permanent-series.ts"],
  },
  {
    id: "C176", category: "money", title: "新版運動的共用與教練個別計酬怎麼設定？",
    summary: "教學項目保存共用預設；每位教練可沿用或覆寫成拆帳、鐘點、每堂固定費，排課時保存版本。",
    answer: "限已啟用新版運動，由有薪酬權限的店主／總部先設教學項目預設，再到教練授課設定選沿用或個別費率；設定費率不等於登錄已付款。",
    path: "新版運動 → 教學項目 → 計酬預設；人員管理 → 教練 → 授課設定",
    keywords: "新版運動 教練計酬 教學項目預設 沿用教學項目預設 個別拆帳 個別鐘點 每堂固定費 0元 覆寫 元每小時 元每堂 原價使用額度 版本快照 待點名 計酬設定已更新",
    steps: ["先在正確教學項目核對授課資格，設定共用拆帳或固定鐘點預設並儲存。", "需要教練例外時，開啟該教練的授課設定；選「沿用教學項目預設」，或個別拆帳、個別鐘點、每堂固定費並填數值。0 是明確覆寫；要回到共用預設須改選沿用。", "排課後從原授課費明細核對課次、教練、時長與保存的來源／費率版本；實際付款另依 C122 登錄，不重複記一筆支出。"],
    important: "查看與管理計酬是獨立薪酬權限；一般排課不會回傳費率。更換教練會改用新教練的個別或共用預設，缺少可證明的計酬時會阻擋；不能拿能排課當成能看或改薪酬。",
    details: ["拆帳以原購買價格及本堂使用額度占原額度比例計算，不是當日收款乘比例；無法證明原價或使用額度時顯示待核對，不猜金額。", "固定鐘點按課次保存的分鐘數換算每小時金額；每堂固定費以該課次固定金額計。尚有學員待點名時先顯示待核對，沒有應計名單時為 0；授課者請假／曠課及已取消課次不照常計費。", "新排課優先使用教練個別費率；個別選沿用或尚無個別設定時才讀教學項目預設。排課保存來源、版本與時長；之後改費率不重算舊課快照。", "只改時間會保留原計酬來源並更新課次時長；更換教練或教學項目會重新擷取新設定。原運動與音樂的舊快照仍按原規則，不用新版設定重算。", "新增或修改設定仍受人員、本店及薪酬權限控制；教練授課資格與後台帳號權限分開。連線中斷先重開原教學項目／教練查是否已儲存，不另建重複人員或費率。"],
    success: "收費方式保存正確計酬，授課費與課次快照一致，舊卡及已排課歷史未被回算。",
    modules: ["course"], permission: "plans.edit", additionalPermissions: ["booking.read", "booking.create", "staff.manage", "customer.read", "wallet.read", "transaction.read", "teacher.compensation.manage"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/music-subject-catalog.tsx", "src/app/(dashboard)/dashboard/courses/staff-workspace.tsx", "src/components/admin/sports-coach-fee-fields.tsx", "src/server/actions/course-staff.ts", "src/server/services/sports-teaching-rule.ts", "src/server/services/sports-coach-compensation.ts", "src/lib/sports-coach-compensation.ts", "src/lib/sports-teacher-fee.ts", "src/server/services/course-teacher-fee.ts", "src/server/services/course-captured-teacher-fee.ts"],
  },
];
