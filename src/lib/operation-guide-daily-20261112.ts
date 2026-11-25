import type { OperationGuide } from './operation-guide-types';
export const dailyOperationGuides20261112: OperationGuide[] = [{
 id:'C181',category:'plans',title:'舊通用課卡顯示科目待核對，店長如何確認？',
 summary:'核對原購買內容後，明確選取此張舊卡的適用科目；保留原餘額、效期與歷史。',
 answer:'在學員持有方案的「核對適用科目」選擇已確認項目，勾選確認後儲存；不能靠卡名或修改商品來推定舊卡權益。',
 path:'顧客管理 → 學員 → 持有方案 → 核對適用科目',
 keywords:'舊通用卡 科目待核對 核對適用科目 確認方案科目 多科目 全選 舊卡快照 不重發方案',
 steps:['由具 plans.edit、wallet.read、customer.read 的 OWNER 或 ADMIN，在原生運動店開啟正確學員與原持有卡。','按「核對適用科目」，核對原購買內容、餘額、已預約及共用成員，再選一項或多項本店有效科目；點數卡另核對每堂扣抵點數，堂數卡每次1堂。','勾選「已核對原購買內容，同意此卡今後用於所選科目；不變更堂數與效期」，按「確認方案科目」。成功後重新讀取原卡核對；取消不儲存。'],
 important:'限科目未明的舊通用卡；不是批次回填或讓所有卡全科通用。共用方案影響所有使用人，必須先確認原購買內容與授權。',
 details:[
  "一項保留單科目，多項共用一份額度；其他科目不能扣。全選只涵蓋當時確認的項目，新增項目不自動加入。",
  "已綁定不同科目或不同扣抵數量的預約會阻擋，先核對原預約，不能為通過檢查而自行取消正式預約。已註銷、期初匯入及來源補課卡不能使用此流程。",
  "不改商品、購買訂單、餘額、效期或上課紀錄；更正留稽核。修改商品不會自動更新既有已購卡。",
  "若資料或預約已更新，重新核對版本；結果尚未確認時只用原請求重試，不另發卡或直接改資料庫。",
  "若舊 OPEN 堂數卡可從同店原收費方式的明確適用項目解析資格，不再顯示科目待核對；以交易時原方案設定核對，不按名稱猜測。尚未設定或點數卡仍須明確核對。原方案適用項目的變更會影響這類舊卡之後的資格，與新卡的已購快照分開判讀。"
],
 success:'原卡顯示已確認的適用科目，原餘額、期限與紀錄保留，沒有跨店或擴大未確認的權益。',
 modules:['course'],permission:'plans.edit',additionalPermissions:['wallet.read','customer.read'],feature:null,kind:'howto',verification:'source-reviewed',
 sources:['src/app/(dashboard)/dashboard/courses/card-subject-review.tsx','src/server/actions/course-card-subject.ts','src/server/services/course-card-subject.ts']
}];
