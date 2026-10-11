# HQ 操作／登入紀錄自動更新

2026-10-10，使用者確定採每 60 秒背景更新，切回頁面立即更新。

## 本次修改

- 僅 HQ 的兩個紀錄頁共用 client refresh 容器；保留原始 server 查詢及權限。
- 可見且連線時更新；重複前景事件去重，transition 未完成不送下一個請求。
- 第 2 頁以後、展開紀錄、正在修改篩選、向下閱讀時暫停自動更新；保留手動更新。
- dateMode=today 明確記錄結束日期跟隨台灣今天，fixed 保留歷史區間。切換分類與分頁保留模式。
- 未版控的舊 localStorage 日期不再復原，保留非日期篩選；新快取保存日期意圖，避免「昨天」被當成今天復原。
- 顯示 server 完成讀取時間；更新失敗不冒稱成功，既有頁面錯誤處理維持。

## 驗證與限制

- 整合主線後本機 5 個相關測試檔、37 項通過；其中 7 項涵蓋計時、前景去重、背景暫停、跨日、歷史日期、閱讀保護、卸載與舊日期快取。
- 修改檔 ESLint、diff check 通過。
- 完整 TypeScript noEmit 通過；重跑採 3GB heap。
- 精確支線加入既有 module-roster-preview 隔離模式：repo/branch/Preview provenance、兩條連線 allowlist、封鎖通知及跳過 migrations。
- 支線草稿交付；精確分支已關閉自動 Vercel 部署。尚未建立隔離 Preview，未完成桌機／iPad 登入後 UI 驗收。
- 無資料庫 migration、通知或正式資料修改。正式站未變更。
