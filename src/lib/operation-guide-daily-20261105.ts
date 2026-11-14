import type {OperationGuide} from './operation-guide-types';
export const dailyOperationGuides20261105:OperationGuide[]=[
  {
    "id": "AGR01",
    "category": "settings",
    "title": "共同約定如何設定、預覽、啟用或暫停？",
    "summary": "音樂、運動及美業共同約定為選用；先完成草稿與預覽，確認後才啟用新版本。",
    "answer": "音樂、運動及美業共同約定為選用；先完成草稿與預覽，確認後才啟用新版本。",
    "path": "設定 → 店家資料 → 共同約定",
    "keywords": "共同約定 約定書 儲存並預覽 確認啟用 暫停 個資告知 系統告知 服務類型",
    "steps": [
      "核對本店模組與可用資格，從共同約定開始設定或修改草稿；範本適用類型未確認時可先存草稿。",
      "依本店實際規則填店家資料、課程或服務規則；運動填活動與風險，美業可複選服務類型、修改帶入範例。取消服務勾選保留文字，但不列本次文件。",
      "核對個資告知：新空白草稿自動產生系統告知，補充說明選填；原手填內容保留，需要才明確選改用系統告知。",
      "按儲存並預覽，核對全文、實際規則與範本適用性，再勾確認並啟用；返回修改仍屬草稿。啟用後才使用本版簽署連結／QR，勿把含簽署憑證的網址公開到不必要範圍。",
      "需要停止新簽署時暫停；舊簽署紀錄另從簽署紀錄核對，不改寫或刪除舊文件。"
    ],
    "details": [
      "未啟用共同約定仍可正常預約、購課或提供服務；條文不會改動系統取消期限、付款或扣堂，須與實際設定一致。",
      "管理需 business_hours.manage 與本模組資格；公開簽署另需部署開通，沒有入口不能借其他店連結或自行啟用正式資格。",
      "美業按摩／美容／美甲／美睫可複選；共同約定與風險分別確認、一份簽名與PDF。音樂與運動保留各自範本，不以相同介面硬套業務規則。",
      "已簽文件保存當時條款與版本；修改草稿不回寫歷史。系統告知不表示新增自動到期刪除、固定五年保存或法律審查服務。",
      "切店或資料版本衝突先重新開啟核對；結果不明保留畫面及原請求查回，不另啟用重複版本。"
    ],
    "important": "未啟用共同約定仍可正常預約、購課或提供服務；條文不會改動系統取消期限、付款或扣堂，須與實際設定一致。",
    "success": "重新開啟原紀錄核對結果；尚未確認時保留原請求，不重建或重複提交。",
    "modules": [
      "course",
      "beauty"
    ],
    "permission": "business_hours.manage",
    "additionalPermissions": [],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/courses/agreements/agreement-workspace.tsx",
      "src/server/services/course-agreement-settings.ts",
      "src/server/services/course-agreement-access.ts",
      "src/lib/course-agreement-privacy.ts",
      "src/server/services/agreement-sharing.ts"
    ]
  },
  {
    "id": "AGR02",
    "category": "customers",
    "title": "如何查找簽署紀錄、查看原版本與下載 PDF？",
    "summary": "在本店簽署紀錄依姓名、電話或日期查詢，查看當時文件；PDF下載另需顧客匯出權限。",
    "answer": "在本店簽署紀錄依姓名、電話或日期查詢，查看當時文件；PDF下載另需顧客匯出權限。",
    "path": "共同約定 → 簽署紀錄 → 查看／下載",
    "keywords": "簽署紀錄 約定書 PDF 下載 代理人 未成年 原版本 清除條件",
    "steps": [
      "核對門市後開簽署紀錄，輸入姓名或電話（含代理人），需要時選日期區間並按查詢。",
      "核對姓名、電話、服務項目、台灣簽署日期及版本；沒有結果先清除條件，不把讀取錯誤當零筆。",
      "點查看核對完整原條款、簽名與版本；返回清單核對原查詢。具匯出權限才下載該筆PDF，勿另截取真實個資作教學。"
    ],
    "details": [
      "查閱需 customer.read、business_hours.view 與本模組資格；下載另需 customer.export。管理設定權限不自動授予簽署證據或匯出權限。",
      "暫停新簽署或修改草稿不覆寫舊紀錄；下載保存當時版本，不拿目前草稿重建舊簽名文件。",
      "只查本店授權資料，未成年及代理人資訊仍受原資料範圍保護；讀取或下載失敗先查原筆，不重新簽署。"
    ],
    "important": "查閱需 customer.read、business_hours.view 與本模組資格；下載另需 customer.export。管理設定權限不自動授予簽署證據或匯出權限。",
    "success": "重新開啟原紀錄核對結果；尚未確認時保留原請求，不重建或重複提交。",
    "modules": [
      "course",
      "beauty"
    ],
    "permission": "customer.read",
    "additionalPermissions": [
      "business_hours.view"
    ],
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/components/course-agreements/records.tsx",
      "src/server/services/course-agreement-records.ts",
      "src/server/services/course-agreement-access.ts",
      "src/components/course-agreements/download.tsx"
    ]
  },
  {
    "id": "MONTH01",
    "category": "money",
    "title": "月結如何新增獎勵、減項及重新開啟調整？",
    "summary": "從營運月結上方新增獎勵與調整；輸入正數加減項，保存成功後同步明細及合計。",
    "answer": "從營運月結上方新增獎勵與調整；輸入正數加減項，保存成功後同步明細及合計。",
    "path": "營運 → 月結管理 → ＋新增獎勵與調整",
    "keywords": "月結 獎勵 調整 增項 減項 正數 事由 日期 歸屬月份 重新開啟 已發薪",
    "steps": [
      "選門市與月份，核對收入來源及月份鎖定；需修改已結算月份時先重新開啟月結。",
      "點上方新增獎勵與調整，依序選日期、人員、＋增項或－減項、正數金額與備註。日期預設今天，跨月依選定日期計入該月份，先看計入月份提示。",
      "確認後按儲存，等待成功回執更新原明細、人員及全店合計；若顯示正在同步明細，先核對原紀錄，不重複新增。",
      "原明細可搜尋、編輯或刪除，鎖定月份須先重開；核對完成再確認月結。改日期移月時須核對原月與新月，畫面仍保留原查看月份。"
    ],
    "details": [
      "調整不改寫原授課費、服務收入或租金，不自動收付款／發通知；已發薪差額建議另記下個月，不自動結轉負數。",
      "需 staff.manage、店長管理角色、月結功能及可管理目標人員層級；課程另受原財務／teacher.settlement.confirm 範圍，美業需原月結確認資格。看得到報表不表示可新增調整。",
      "各模組保留原收入規則：蒸足租金獨立，音樂／運動授課費及店長利潤按原授權，美業僅拆帳與加減項、不新增已付／未付欄。",
      "日期升冪逐筆明細可局部捲動，沒有新增審核狀態欄；保存或刪除失敗保留草稿，版本衝突先重讀，較舊回覆不覆蓋新回執。完整報表尚未同步時不能用舊版本確認月結。"
    ],
    "important": "調整不改寫原授課費、服務收入或租金，不自動收付款／發通知；已發薪差額建議另記下個月，不自動結轉負數。",
    "success": "重新開啟原紀錄核對結果；尚未確認時保留原請求，不重建或重複提交。",
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "permission": "staff.manage",
    "additionalPermissions": [],
    "feature": "service_fee_calculator",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/service-fee-calculator/monthly-adjustments.tsx",
      "src/server/actions/staff-monthly-adjustment.ts",
      "src/components/operations/monthly-adjustment-context.tsx",
      "src/server/services/staff-monthly-adjustment.ts"
    ]
  }
];
