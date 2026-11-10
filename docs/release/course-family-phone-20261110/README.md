# 課程家庭電話與日期格子發布候選

## 問題與結果

同一聯絡電話、不同姓名的孩子可各自建檔，方案、堂數及預約仍依獨立學員 ID；不額外建立大人顧客。LINE 完成身分驗證後，由店長確認電話群組的唯讀查看授權。會員首頁一人一列，展開看各方案的固定堂數格；只填實際出席或有效補登日期，預約不填成上過課。

本候選亦包含原任務已實作的後台補登、店舖脈絡與課程名額修正；沒有放入 A 測試的建置跳過、專用 scope、測試 fixture、登入憑證或短效分享 token。正式 package/build/migration guard 與 Vercel 部署設定沿用最新 main。

## 來源與整合

基底先整合 PR1532，再整合 `c4583d3cd68b89a92c1fb42d41e4db06e075932e`（PR1533），已驗 A 來源 `a2456b0d958614e8d8d09b6b1b8e7099f917a1ba`。工作分支 `codex/course-family-release-20261110`；原 A 與原工作區均保留。

保留最新顧客總覽及混合排課；電話查看面板插入新的音樂／原生課程總覽，不恢復舊版重複詳情，不顯示在其他模組的 source 表單。指定學員尊重使用者明確填寫的課程名額、不受空間名額限制，保留 OPEN 混合固定學員；合併測試 mock 以實際傳入學員 ID 數量回應，並分開一般排課與正式音樂排課的 mock。

## 已有驗證與限制

最新基底整合回歸：25檔269項通過，2檔34項外部PG案例因無專用連線而跳過；不寫成全部303項通過。兩個新migration的PGlite資料限制與權限測試包含在通過項目中。完整型別檢查已通過；整合修改檔 ESLint 無錯誤，移除已不再使用的空間名額查詢後無警告。新整合Preview狀態另附結果，不用舊 A SHA 的截圖代替新 SHA。

已驗 A 的本人 LINE 截圖涵蓋既有會員及四位合成學員、各自方案與空白日期格、堂數／預約占用、收合；真實後台點名8→7與更正7→8、日期來源新增11/10後清空，以及合成測試資料清理已有證據。本人 LINE 沒有在已出席時新增截圖；全新 LINE 首次認領只有自動測試，沒有真人首次綁定證據。其他四模組原始問題不可因家庭顯示驗收而一概寫成正式已修復。

## 正式資料庫需求（尚未執行）

精確 migration ID／SHA256 見 migration-manifest.json，順序不可互換：

1. `20261110082629_course_family_contact`：增加 nullable contactPhone，保留非空個人電話的本店唯一性，允許獨立學生共用聯絡電話，限制純聯絡資料不能變成登入身分。
2. `20261110095649_course_phone_view_grant`：增加本店電話查看授權、租戶外鍵、RLS、撤銷 trigger，維持 PUBLIC/anon/authenticated 無表權限。

只讀檢查時正式庫 Customer736筆、空白電話0；contactPhone與授權表均不存在，兩筆migration ledger也不存在；電話全唯一索引與Customer(id,storeId)唯一鍵存在。這是查核當下快照，不是寫入時保證；正式執行前須重新檢查並在同一有界鎖定交易取得前後筆數與原欄位摘要。禁止只上新程式而漏裝schema；禁止以prisma migrate deploy順便套用其他未授權migration。

## 發布與回復

正式 schema 寫入、main 合併及正式部署尚未獲准。本候選不更動原 migration guard allowlist，也不啟用 PRODUCTION_MIGRATION_TARGET。先取得精確SQL／目標庫授權，再採既有受審核的安裝程序，記錄兩筆原migration名稱與checksum；失敗整筆回滾，成功核對schema、RLS／grants、ledger及原顧客未改動，然後才發布相符程式。

回復不能刪除 contactPhone、授權表或重建舊的全電話唯一索引來消除新學員。若尚未新增家庭學員，應保留新schema再評估回退；若已有純聯絡電話學員，舊版個人電話唯一假設不再完整，不得宣稱可無條件一鍵回退，須用保留新schema相容性的修正版。授權撤銷不合併或刪除顧客，不改餘額／歷史。

A 通知停發維持封鎖；本輪不依賴 Cloudflare，未調整它的設定。正式上線前仍須核對來源SHA／部署READY／適用入口，不以本地通過代替部署完成。


## PR1533 同步與共用日期格

準備期間正式分支新發布課程進度與登入恢復版，已整合而非覆蓋：會員讀取移至 course-member-workspace query 的改動保留，聯絡電話投影跟著轉移；phone-first 的既有電話認領仍走本次已驗的群組確認，具姓名的新登記沿用新的 onboardOrRecoverCourseLineMember，不退回舊登入恢復流程。

前台改用後台同一個 LessonProgressGrid，僅新增可選的欄數／摘要標題／呈現class，後台預設五欄與可點日期不變。前台8堂四欄、10堂五欄、1–3堂依實際格數，格子含time標籤；兩種入口各自保留其讀取授權，不把後台權限拿來讀家屬資料。

整合的登入／家庭／格子8檔143項通過；前台合成瀏覽器390/440/768/1366寬度通過。擴大回歸發現並修正舊測試fixture：電話摘要mock使用有原始實作的vi.fn，避免resetAllMocks後變成無回應；本機PostgreSQL fixture補足現行附加項目授權的期限欄位及public通知表。通知表沿用來源DDL，僅因合成Store位於各套件schema而省略本機fixture的public Store FK，沒有修改正式DDL或mock掉扣堂。初次完整typecheck碰到Node預設4GiB heap上限，使用單次程序6GiB後通過；不是把OOM記成通過。

只在候選分支新增 Vercel 自動部署=false，避免送審分支自動建置連線；main與原有其他分支設定不變。A測試額外隔離仍僅留在A分支。


## 最終本機驗證

固定 PR1533 整合後業務程式，共109檔1926項通過；2項 opt-in 原生瀏覽器案例未開啟，未列為通過。PostgreSQL 使用本機 loopback PostgreSQL16 暫存容器，無正式資料。已同時執行家庭聯絡／授權／登入／格子、最新版課程UI／登入恢復、混合排課及音樂／運動／美業核心流程。完整TypeScript使用單次6GiB heap通過；修改元件與查詢ESLint通過。沒有為修正fixture而刪除原驗證斷言或mock掉扣堂。

A最終隔離來源5a624a3faf9c45f5ecb08317b6941662e2ffe46c，與候選的src/prisma內容完全相同（唯一額外test為A隔離範圍測試），建置與DB隔離支援設定不進正式候選。最後Preview與CI狀態以送審時平台證據為準。本人過往A畫面／後台操作證據是前一已驗來源；新版共用格子有獨立版面與回歸證據，不把舊截圖寫成此新SHA的真人LINE首綁驗收。
