import type { OperationGuide } from './operation-guide-types';

export const dailyOperationGuides20261030: OperationGuide[] = [
  {
    id: 'F14', category: 'care', title: "LINE 恢復後，為什麼舊通知仍不補發？",
    summary: "外發依核准切換時間、門市與個人偏好處理；未設定或尚未到時間仍停送，入站身分處理獨立。",
    answer: "只核對符合切換後時間的新事件；系統不把舊待送訊息重新當成新事件，不靠店家反覆切換開關恢復。",
    path: '提醒管理 → 發送紀錄；必要時聯絡總部確認系統停送狀態',
    keywords: 'LINE 系統暫停 全站停送 推播 回覆 delivery_paused 開關已開 收不到 不重送 不重綁 舊佇列',
    steps: [
  "先核對原事件時間、門市及發送紀錄，由總部確認已核准的切換時間是否生效。",
  "確認本店「本店 LINE 通知」、收件人及個別通知偏好；既有關閉選擇不會被自動打開。",
  "入站電話與身分驗證可獨立處理；保留原預約／購買並回後台核對，不以沒有歡迎訊息判定失敗。"
],
    important: "程式已從固定全面停送改為核准時間控管；本次沒有讀取或變更正式切換設定，不能據程式已合併宣稱所有店均已恢復送達。",
    success: "能分辨新事件、舊佇列、店家開關與本人連結，不重複建立預約或發送歷史通知。",
    details: [
  "未設定、格式無效或尚未到核准時間，外發仍暫停；符合時間後仍檢查功能、通道、收件人與個別開關。",
  "非同步通知依原事件時間過濾；切換前、缺少時間或不合理未來時間不當作新事件送出。",
  "加入好友的歡迎訊息已移除；加入好友不代表通知授權、綁定或會員登入已完成。",
  "已驗證的入站處理與外發停送切開，不因外發暫停而阻擋本來可安全完成的身分處理。",
  "數位管家後台小鈴噹與 LINE 外發分開；關閉 LINE 不會關閉後台待辦。"
],
    modules: ['steamfoot', 'course', 'beauty'], permission: 'business_hours.manage', feature: null,
    kind: 'troubleshooting', verification: 'source-reviewed',
    sources: [
  "src/lib/line-delivery-pause.ts",
  "src/lib/line.ts",
  "src/app/api/line/webhook/route.ts"
],
  },
  {
    id: 'LN01', category: 'customers', title: "顧客 LINE 如何由店長核對後以手機重新綁定？",
    summary: "LINE 狀態旁直接開始重新綁定；授權後由本人於15分鐘內輸入手機，安全條件符合才自動完成。",
    answer: '由有權限的負責人或管理員核對本人與本店，再處理原 LINE 關聯；會員登入、Google 與通知綁定仍分開。',
    path: "顧客管理 → 顧客概況 → LINE 狀態旁重新綁定",
    keywords: "LINE 同頁 管理 重新綁定 取消LINE綁定 解除 本人核對 15分鐘 24小時 確認重新綁定 返回 候選身分 狀態旁 手機重綁 不需確認碼 已驗證會員",
    steps: [
  "核對本人、門市、姓名與手機，在 LINE 狀態旁按重新綁定。",
  "填核對原因並開始15分鐘授權，請本人在本店官方 LINE 輸入自己的手機，不要求另外傳確認碼。",
  "後端安全核對通過才自動完成；失敗保留提示並檢查手機或 LINE 是否已屬他人，不重複建顧客或強制覆蓋。",
  "回原概況重新讀取狀態；需要撤銷時取消原申請。解除綁定另有明確確認，並保留預約、方案及收款。"
],
    important: "僅具權限的 OWNER／ADMIN 可核准；電話本身不是接管證據，仍檢查已驗證的共用會員、店家與身分衝突。重綁不等於已登入或通知送達。",
    success: '原頁狀態與實際關聯一致；預約、方案及消費歷史保留，沒有誤改其他顧客或門市。',
    details: [
  "未綁定顧客不再以產生24小時綁定碼為主要步驟；採店長本人核對後15分鐘手機重綁。",
  "符合條件時沿用已驗證中央會員身分；不同會員或衝突仍拒絕，不借別店資料覆蓋。",
  "處理失敗的原申請仍可依提示重試，不能因一次失敗就推定已用完或建立重複申請。",
  "通知恢復與入站處理分開，見 F14；本題只教後台核對與授權，不重建前台指南。"
],
    modules: ['steamfoot', 'course'], permission: 'customer.identity.rebind', additionalPermissions: ['customer.read', 'customer.update'], feature: null,
    kind: 'howto', verification: 'source-reviewed',
    sources: ['src/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced.tsx', 'src/app/(dashboard)/dashboard/customers/[id]/line-binding-section.tsx', 'src/server/actions/customer-panel-advanced.ts', 'src/server/actions/customer-line.ts', 'src/server/services/customer-line-binding-code.ts', 'src/server/services/customer-line-unlink.ts', 'src/server/services/line-rebind-execute.ts'],
  },
  {
    id: 'C179', category: 'plans', title: '同項目有多張方案，為什麼餘額合計、點名卻提示先繳費？',
    summary: '新版按同授課／服務項目核對有效權益，分單位合計；一般扣用依先買先扣，安排位置不代表已付款。',
    answer: '先核對項目、顧客、有效期、共用授權與可用額度；餘額不等於尚可使用，未繳費者可先安排，但不能略過結算檢查。',
    path: '課表／班表 → 原課次或預約名單 → 餘額、繳費／購買方案與出席狀態',
    keywords: '項目權益 先買先扣 同項目方案合計 剩餘 可用 分單位 堂 點 次 先排後付 先繳費 尚未扣堂 音樂 運動 美業',
    steps: ['在原名單核對授課／服務項目及顧客；同名課或同價方案不等於同一權益。', '分別查看剩餘與可用；已預約占用會影響可用，堂、點或次不混加，共用卡不重複計算。', '需要購買或繳費時從原名單入口處理並核對原交易；購買成功不會自動點名。若連線中斷先依 FIN02 核對，不重收。', '實際上課／服務後才處理出席或完成。提示先繳費、無有效方案或額度不足時停止，回原顧客權益核對，不手動補點或重建預約。'],
    important: '先買先扣仍需同項目、有效期、單位、名單及共用授權相符。已完成歷史、期初匯入及來源綁定的補課權益保留原規則，不任意換卡。',
    success: '原預約、購買與扣抵歷程能對應；沒有因餘額合計重複扣堂或把尚未付款當作完成。',
    details: ['運動與音樂新版一般排課先選項目，可安排未購課的既有學員；名單內購課後更新同項目餘額。出席結算會重新核對可用卡，符合資格者按購買先後扣用，購買時間相同再以固定順序處理。', '同項目合計只是摘要；不會合併實際卡片、改寫購買批次或混合不同單位，退款、更正仍回原交易與帳本。', '美業保留已付單次服務及專用帳務流程。未付的一般服務若沒有足額適用方案，不能直接完成；已部分收款仍須先結清，不用新卡默默抵掉未收款。體驗仍依原資格與收費流程。', '原本待處理且綁卡的一般預約，結算時可重新核對同項目卡並留下釋放／保留與更換來源紀錄；既有已扣款歷史不因此回寫，取消或恢復仍依原帳本。'],
    modules: ['course', 'beauty'], permission: 'booking.read', additionalPermissions: ['wallet.read'], feature: null,
    kind: 'troubleshooting', verification: 'source-reviewed',
    sources: ['src/lib/item-entitlement.ts', 'src/components/admin/item-balance-summary.tsx', 'src/server/services/sports-card-selection.ts', 'src/server/services/music-item-cards.ts', 'src/server/services/course-item-attendance.ts', 'src/server/services/course-booking.ts', 'src/server/beauty/item-entitlement.ts', 'src/server/beauty/booking.ts'],
  },
  {
    id: 'FIN02', category: 'money', title: '購買、收款或核帳中斷後，如何接續原請求？',
    summary: '先重新核對原請求；查無紀錄或逾時不等於失敗，未確認前不要再收款或核帳。',
    answer: '保留原門市與顧客，依接續視窗核對處理中、待確認、已完成或已取消；不要換付款方式建立第二筆。',
    path: '原顧客／名單 → 購買方案；美業收款或線上訂單核帳的原接續視窗',
    keywords: '購買中斷 收款中斷 核帳中斷 原請求 重新核對 安全取消 已完成 已取消 結果尚未確認 查無紀錄 不重複收款 音樂 運動 美業',
    steps: ['回原門市及顧客開啟同一購買／收款／核帳入口，先等畫面確認購買狀態。', '結果尚未確認或查無紀錄時按「重新核對」；逾時後原請求仍可能完成，不另外建立新單。', '只有畫面提供時才接續同一原請求或「安全取消原請求」；取消前讀取涵蓋範圍。狀態仍不明時交管理者核對。', '已完成時核對原方案與交易，按「確認完成並繼續購買」或美業的「確認並更新」；已取消時確認取消結果。完成這次核對後，才依實際需求處理下一筆。'],
    important: '安全取消不是退款，也不撤銷已成立購買或已收款；查無紀錄不是失敗證明。不得用重整、更換顧客、付款方式或新請求繞過結果未明。',
    success: '原請求只有一份有效結果，方案、交易與實收能對應，沒有重複發卡、收款或核帳。',
    details: [
  "各模組保留自己的付款規則及權限；購買／線上核帳另需方案建立、收款與顧客查看權限，唯讀不能操作。",
  "美業批次收款的安全取消可能涵蓋原請求中的全部服務；它取消尚未成立的收款請求，不是取消那些服務預約。已完成的原收款須回原交易處理。",
  "本機原請求資訊無法讀取、跨店或顧客已切換時，停止異動並核對原資料；晚到的回應不能當作新顧客的結果。",
  "畫面已確認購買完成但名單更新失敗時，只重新讀取原方案與交易，不再次購買；方案開通與實際 LINE 通知分開，目前核准時間與新事件限制見 F14。"
],
    modules: ['course', 'beauty'], permission: 'transaction.create', additionalPermissions: ['wallet.create', 'customer.read'], feature: null,
    kind: 'troubleshooting', verification: 'source-reviewed',
    sources: ['src/app/(dashboard)/dashboard/courses/purchase-recovery.tsx', 'src/components/beauty/collection-recovery.tsx', 'src/components/beauty/online-confirm-recovery.tsx', 'src/server/actions/course-purchase-intent.ts', 'src/server/actions/beauty-collection-intent.ts', 'src/server/actions/beauty-online-confirm-intent.ts', 'src/lib/purchase-intent-coordinator.ts'],
  },
];
