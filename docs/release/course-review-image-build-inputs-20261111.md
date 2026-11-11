# 正式建置驗收圖片排除時點修正

使用者已授權本對話完成通用卡發布及必要修正。本後續修正僅處理 Vercel 建置輸入，不改課程、帳務、身分、權限或資料庫結構。

- 已合併 PR1544，main e5c25347，正式DB已套用已驗證的3欄位／3個CHECK遷移；新欄位、既有欄位與RLS／ACL結構核對通過，沒有讀取或轉換正式業務資料。
- 部署 dpl_3WZrJ2bYV7nLHgMBjyuoTDp3v96W 編譯與型別完成後，在平台封裝時回報 ENOENT：artifacts/addon-density-20261103/1366.png。Vercel已在postbuild前捕獲路徑，移除原始檔案的時點太晚。未發布此部署，原正式站仍可用。
- 將驗收圖片封存移至既有第一個build指令的preflight，在Next/Vercel開始追蹤前完成。嚴格保留 production/main/project/repo/build-sandbox 範圍，SHA256逐檔核對外部封存；Git證據、公用圖片與其他執行資源保留。
- postbuild若仍發現驗收圖片路徑，明確停止，不再移走已被追蹤的來源檔案。沒有調高平台大小限制或修改權限來放行。
- 4檔／40個封裝、入口、範圍、LINE與DB-probe次序測試通過；ESLint通過。Preview與開發工作樹不執行封存，原建置scope gate不放寬。
- 此修正分支沿用review-only自動部署／migration停止措施。PR CI通過後才合併並進行一次正式建置，完成後以PR描述更新發布證據。
