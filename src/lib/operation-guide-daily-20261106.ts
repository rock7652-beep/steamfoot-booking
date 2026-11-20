import type { OperationGuide } from './operation-guide-types';
export const dailyOperationGuides20261106: OperationGuide[] = [
  {
    "category": "settings",
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "additionalPermissions": [],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "id": "REF01",
    "title": "如何取得店家推薦碼、查看免費天數？",
    "summary": "由店長從訂閱方案進入我的推薦，核對本店推薦碼及已保留或已發放的主訂閱免費天數。",
    "path": "設定 → 訂閱方案 → 我的推薦與免費天數",
    "keywords": "推薦碼 我的推薦 免費天數 推薦連結 複製推薦連結 LINE 分享 30天 獎勵保留 訂閱 同頁 店家推薦碼 複製推薦碼 複製連結",
    "permission": "staff.view",
    "steps": [
      "核對目前門市，由具 staff.view 的有效 OWNER 店長進入訂閱方案，選「我的推薦與免費天數」。活動未開通時保留原訂閱，不借其他店入口。",
      "尚無推薦碼時按「取得我的推薦碼」；已有碼直接核對，同店重試沿用原碼，變更方案不另換碼。",
      "需要提供給朋友時按「複製推薦連結」；複製失敗可手動選取完整連結。「分享到 LINE」會另開外部分享，確認對象與內容後才送出。",
      "在我的推薦查看本店獎勵天數與狀態；逾期店家獎勵可保留，恢復有效訂閱後由總部核對，不會因領取獎勵自動重新開店。"
    ],
    "details": [
  "推薦成功須為不同帳號、不同營運者，朋友首次付費啟用並滿 30 天且無退款，再經總部核對，雙方各得主訂閱 30 天；不是送出連結或填推薦碼就立即發放。",
  "本店只看自己的推薦碼與免費天數，不提供朋友電話、聯絡或付款明細。非有效 OWNER 或沒有 staff.view 時，不能以指南可搜尋推定可進入功能。",
  "入口及活動受部署開通與資料就緒條件控制；顯示尚未開通不代表現有訂閱失效。免費天數不等於加購額度、課程堂數或會員點數。",
  "課程店可在「設定 → 營業與預約」的「店家推薦碼」同頁查看；已有碼按「複製推薦碼」或「複製連結」，未有碼且具資格時按「取得推薦碼」。訂閱方案入口也保留；免費天數與推薦紀錄仍到「我的推薦與免費天數」核對。複製不會自動分享到LINE或發放獎勵。"
],
    "important": "推薦獎勵經總部核對後發放；分享或取得推薦碼不會立即延長訂閱，也不代表通知已送達。",
    "success": "重新查看本店推薦碼及獎勵狀態；已保留與已發放分別核對，不重建碼或自行改訂閱期限。",
    "sources": [
      "src/app/(dashboard)/dashboard/settings/plan/page.tsx",
      "src/app/(dashboard)/dashboard/settings/subscription-referrals/page.tsx",
      "src/components/subscription-referrals/my-code.tsx",
      "src/server/actions/subscription-referral.ts",
      "src/lib/subscription-referral-policy.ts",
      "src/server/services/subscription-referral/runtime.ts"
    ],
    "answer": "由店長從訂閱方案進入我的推薦，核對本店推薦碼及已保留或已發放的主訂閱免費天數。"
  },
  {
    "category": "settings",
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "additionalPermissions": [],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "id": "REF02",
    "title": "總部如何核對推薦收款、發放雙方各 30 天？",
    "summary": "總部先確認推薦店家、首次付費及最新退款核對，符合條件後一次發放雙方主訂閱各 30 天。",
    "path": "總部 → 店家訂閱管理 → 推薦活動核對與發放",
    "keywords": "推薦獎勵 首次付費 收款核對 退款 待確認收款 等待滿30天 待確認無退款 可以發放 已退款不發放 月繳 免費期間不扣款 獎勵已保留",
    "permission": "staff.manage",
    "steps": [
      "以總部有效 ADMIN 身分及 staff.manage 進入推薦獎勵，不在 HQ 切店檢視中操作。活動未開通或資料表未就緒時停止，不從此頁建立資料表。",
      "確認店家：核對需求諮詢的推薦碼與同意資料，先關聯體驗申請，再核對朋友店家；可用店名或 ID 查找，清單每頁 25 筆，需翻頁查完整範圍。已綁定關係不能任意覆寫。",
      "確認收款：核對朋友的首次付費訂閱、收款憑證、入帳時間、首次付款及不同營運者，再保存核對結果。已登記收款以原紀錄查看及更新退款核對，不重建憑證。",
      "等待滿 30 天並完成最新無退款核對；起算採入帳與啟用兩者較晚時間，再經過完整 30 天。核對「等待滿30天」「待確認無退款」「已退款不發放」等狀態，不以查詢或修改時間冒充退款核對。",
      "發放前核對雙方原到期日與新到期日。非試用的月繳店家，逐方填寫免費期間實際不扣款安排的核對參考，確認「已確認以上免費期間不扣款」；系統不會自動停止外部銀行扣款。",
      "符合條件才按「確認發放雙方各 30 天」；已有一方發放時依畫面「完成剩餘獎勵發放」處理。結果未知先查原筆狀態，不手改期限或另建推薦；到期日已變時保留草稿並重新核對。"
    ],
    "details": [
      "資格限首次付費、不同帳號與營運者，且推薦綁定不得晚於入帳；退款、同人推薦、付款不符或非首次付款不能強制發放。人工核對不繞過後端規則。",
      "獎勵是雙方主訂閱各 30 天；到期、取消、待啟用或缺少可用期限時先保留，恢復有效資格後再核對。已封存店家不能因獎勵重新啟用。",
      "月繳的核對必須對應該店當下訂閱及完整免費期間，期限變動需重新確認；年繳或試用不要求同一份月繳安排資料。外部扣款是否停止仍須總部實際查證。",
      "雙方發放具交易與重送防重檢查；按鈕鎖定或單次回覆不能取代重新查回。發放、收款核對與退款查核各有紀錄，不等於寄出任何通知。",
      "功能需總部身分、權限及活動部署就緒；指南原有 HQ audit.read 可見條件仍保留，不藉新增文章擴大實際管理權限或開通正式活動。"
    ],
    "important": "按發放前逐方核對期限與月繳不扣款安排；本功能不會自動替總部停止銀行扣款，未就緒或結果未知不得重複發放。",
    "success": "原推薦紀錄呈現雙方已發放或獎勵已保留及正確期限；只依原紀錄查回，不手動改期、另建獎勵或重新收款。",
    "sources": [
      "src/app/hq/dashboard/stores/referrals/page.tsx",
      "src/components/subscription-referrals/hq-view.tsx",
      "src/server/actions/subscription-referral.ts",
      "src/lib/subscription-referral-policy.ts",
      "src/server/services/subscription-referral/repository.ts",
      "src/server/services/subscription-referral/runtime.ts"
    ],
    "answer": "總部先確認推薦店家、首次付費及最新退款核對，符合條件後一次發放雙方主訂閱各 30 天。"
  }
];
