# 推薦功能真實隔離驗收

應用來源 `5db2b76116eb3ad148398414a709dec5621661b2`；Vercel 專案 `steamfoot-referral-qa-20261105`，部署 `dpl_AKqcBGPciqK6Zift2LDRFT29bxu4`，READY。只有 Preview 啟用推薦，正式站未合併、未發布、活動保持關閉。配置與隔離邊界以 [QA 規範](../../docs/marketing/subscription-referral-qa.md) 為準。

## 已實測

- `initial-browser.json`：真實 OWNER/HQ 密碼登入；正常店家 slug 入口可用，OWNER 不能看到 HQ 管理內容。
- `intake-browser.json`：真實申請表帶碼，確認框預設未勾選；合成 HQ 送出回應200、NOT_SENT_PREVIEW，無 Sheet／LINE／Email／金流外發。
- `transaction-browser.json`：真實 server actions 鎖定歸屬、收款與退款查核，建立雙方各30天；試用推薦人與月繳朋友實際套用。月繳缺扣款核對先被拒，補齊後成功；重播相同 Next-Action multipart 請求回應200、未重複延長。測試腳本首次對錯誤文字的選擇器預期「月繳」，實際提示「扣款安排」，修正選擇器後接續朋友發獎；未重新發放已完成的推薦人獎勵。
- `database-applied.json`：相同請求重送後，只有兩筆 APPLIED／30天，A 11/25→12/25、B 11/30→12/30，Store 與 current StoreSubscription 一致，只有兩筆發獎稽核。
- `beneficiary-browser.json`：分別以 A/B 真實店家 session 讀到已發放30天；附 `reward-visible-a.png`、`reward-visible-b.png`。
- `rwd-browser.json`：390／768／1024／1366 px 的實際店家與HQ頁面，包含展開核對表單、登出與角色切換；8組無水平溢出及 pageerror，附各尺寸截圖。
- `database-reset.json`：只重置合成 A→B 案例，原始申請與推薦碼保留，恢復原始期限，保留兩筆發獎稽核並新增兩筆恢復稽核。現有獎勵0筆，滿30天申請重新待綁定。
- `ready-browser.json`：恢復後的正常店家登入與實際剪貼簿連結、HQ待綁定預備案例；附 `hq-ready-for-user.png`。
- `prisma-lock-regression.json`：無網路 PostgreSQL17 容器與真實 Prisma 重現 void 查詢 P2010，轉 text 後成功，保留交易鎖。PGlite 測試 adapter 加入 Prisma void 邊界；舊查詢負向控制失敗、修正後相關42項通過。

CI [41971134972](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41971134972) 的 Targeted tests、Changed-file ESLint、Typecheck、Full Vitest baseline 全部成功。部署來源與程式檢查一致；後續只提交驗收文件／合成截圖，不重建相同應用。

## 限制

申請表在隔離 Preview 需合成 HQ 登入及固定測試店名前綴；正式朋友不需 HQ 登入。新申請仍需原有人工體驗申請關聯，不靠同名自動配對。完整發獎採已預備滿35天的合成付款與開通紀錄，不縮短30天規則。

刻意以 OWNER 進入拒絕的 HQ 頁面時，串流 notFound 會顯示404文案、沒有管理內容，但有 React #419 fallback pageerror（記於 initial-browser.json），不將此項寫成全流程零錯誤。正常授權頁面、交易、RWD與最後準備檢查無 pageerror。此項不代表越權或發獎失敗。

沒有實際金流扣款或第三方通知，沒有驗證綠界實際停扣。登入密碼、資料庫密碼、AUTH_SECRET 與臨時分享 token 不提交；測試帳號和密碼另交付。雲端 Chromium 驗收不等於已操作使用者本機瀏覽器。
