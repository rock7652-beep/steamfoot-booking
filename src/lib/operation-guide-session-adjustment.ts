import type {OperationGuide} from './operation-guide-types';
export const sessionAdjustmentGuide:OperationGuide={
  id:'PLAN-SESSION-ADJUST',category:'plans',title:'如何補登以前上過的課，或註銷部分堂數？',
  summary:'在方案右側「⋯」選擇補登或註銷；補登已上課與註銷堂數都會扣除額度，但只有補登記錄實際上課日期。',
  answer:'四模組從方案右側「⋯」選擇補登已上課／已服務，或註銷堂數／次數。填錯時音樂／運動／美業在原調整紀錄點「更正返還」，蒸足在方案「⋯ → 使用紀錄」選原堂次、填原因後更正返還。',
  path:'顧客管理 → 學員／顧客 → 持有方案',
  steps:['從方案右側「⋯」選「補登已上課／已服務」或「註銷堂數／次數」。共用方案須選擇學員。','補登填寫實際上課日期；註銷不填上課日期。原因選填，核對可調整數量與剩餘額度預覽。','確認後原面板顯示新餘額與紀錄；填錯時音樂／運動／美業在原調整紀錄點「更正返還」，蒸足展開方案「⋯ → 使用紀錄」並選該堂「更正返還」，填寫原因再確認。'],
  important:'補登會同步扣除額度，請先核對系統是否已扣過，避免重複扣堂。已預約占用的額度不能調整。',
  success:'原面板顯示更新後的餘額，以及實際上課日期（補登）、操作時間與操作人員；原因未填顯示未填寫。',
  details:['蒸足在顧客方案展開「⋯ → 使用紀錄」，選原補登或註銷堂次，點「更正返還」，核對原日期、填寫更正原因後確認；每次返還一堂，格子恢復空白，保留原日期、原因與操作者。僅能處理未綁定預約的手動紀錄；預約出席須從原預約更正，整份註銷不能重新啟用。到期方案更正不延長期限，收款不異動，結果待確認時沿用原請求重試。','音樂／運動／美業方案格子中，補登顯示實際上課日期；註銷以灰格顯示註銷當天日期，不計為出席，更正返還後恢復空白。顧客前台不顯示內部堂數異動清單。','音樂／運動補登若同一學員、同一方案當天已有扣堂紀錄，會先提醒而不扣堂；先核對原課堂，確認是另一堂才點「確認為另一堂，仍要補登」。更改日期、堂數或既有紀錄有異動時須重新核對。','方案右側「⋯」集中補登、部分註銷、調整期限與整份註銷；點方案名稱也進入同一張方案的紀錄。未送出前可切換操作，送出中或結果待確認時保留原請求；不會直接扣堂。','補登與註銷不新增收款、薪資、業績或補課權益；註銷不算出席。','更正以新紀錄返還，保留原紀錄；已註銷整張的方案不能以此功能重新啟用。','音樂保留購買期別與首堂效期規則；來源方案、期初匯入與補課權益仍由原專用流程核對。未確認期別時不猜測分配。','結果待確認時，只重試原請求；不要另外送出相同調整。'],
  keywords:'蒸足 使用明細與更正 調整堂數 補登已上課 歷史上課 日期 單堂註銷 註銷堂數 原因選填 更正返還 原面板 不跳頁 音樂 運動 美業',
  modules:['course','beauty','steamfoot'],permission:'wallet.adjust',additionalPermissions:['wallet.read','customer.read'],feature:'plan_management',
  sources:['src/components/admin/wallet-session-correction-form.tsx','src/server/actions/wallet-session-correction.ts','src/server/services/wallet-session-correction.ts','src/components/admin/plan-session-adjustment.tsx','src/server/actions/course-session-adjustment.ts','src/server/actions/beauty-session-adjustment.ts'],verification:'source-reviewed',kind:'howto',
};
