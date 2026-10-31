import type {OperationGuide} from './operation-guide-types';
export const sessionAdjustmentGuide:OperationGuide={
  id:'PLAN-SESSION-ADJUST',category:'plans',title:'如何補登以前上過的課，或註銷部分堂數？',
  summary:'在持有方案原面板使用「調整堂數」；補登已上課與註銷堂數都會扣除額度，但只有補登記錄實際上課日期。',
  answer:'開啟持有方案的「調整堂數」，選補登已上課或註銷堂數，核對餘額預覽後確認；原因選填。',
  path:'顧客管理 → 學員／顧客 → 持有方案 → 調整堂數',
  steps:['點「調整堂數」，選擇補登已上課或註銷堂數；數量預設 1，共用方案須選擇學員。','補登填寫實際上課日期；註銷不填上課日期。原因選填，核對可調整數量與剩餘額度預覽。','點「確認調整」，原面板顯示新餘額與紀錄；填錯時在原調整紀錄點「更正返還」，核對數量再確認。'],
  important:'補登會同步扣除額度，請先核對系統是否已扣過，避免重複扣堂。已預約占用的額度不能調整。',
  success:'原面板顯示更新後的餘額，以及實際上課日期（補登）、操作時間與操作人員；原因未填顯示未填寫。',
  details:['補登與註銷不新增收款、薪資、業績或補課權益；註銷不算出席。','更正以新紀錄返還，保留原紀錄；已註銷整張的方案不能以此功能重新啟用。','音樂保留購買期別與首堂效期規則；來源方案、期初匯入與補課權益仍由原專用流程核對。未確認期別時不猜測分配。','結果待確認時，只重試原請求；不要另外送出相同調整。'],
  keywords:'調整堂數 補登已上課 歷史上課 日期 單堂註銷 註銷堂數 原因選填 更正返還 原面板 不跳頁 音樂 運動 美業',
  modules:['course','beauty'],permission:'wallet.adjust',additionalPermissions:['wallet.read','customer.read'],feature:'plan_management',
  sources:['src/components/admin/plan-session-adjustment.tsx','src/server/actions/course-session-adjustment.ts','src/server/actions/beauty-session-adjustment.ts'],verification:'source-reviewed',kind:'howto',
};
