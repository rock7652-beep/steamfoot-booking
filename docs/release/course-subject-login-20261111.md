# 同科目方案與原有首次登入恢復：正式發布整合

使用者於本對話明確授權「跟1538一起合併正式站」。PR1538整合PR1541後採一次main合併、一次正式建置發布；不先發布只有其中一項的中間版本。實際發布結果以PR1538最新說明的merge SHA／deployment ID／READY與網域查核為準，本文件保留發布前驗證。

## 整合內容

- 基底正式main `c4443133bf1998b4293868ca0284a078d8dc1d36`，保留已上線的同電話多人唯讀查看、日期格、文案密度與音樂／運動指定學員及空間不限名額。
- PR1538：OPEN／ASSIGNED依同科目方案資格與原購買快照扣抵，A1/A2/A3合計，B/C不計入。有效既有綁卡沿用，未綁卡FIFO，每次一張卡；舊無科目卡要明確逐卡核對，沒有批次改寫正式權益。
- PR1541：恢復原有單一未綁定學員的姓名／手機首次登入；改為共用既有first-activation程式，不保留重複的身份寫入邏輯。多人查看核准及已有身分衝突仍保留，不取消授權、不新增誤填撤回功能。
- 合併衝突將enrollmentMode／bookingAudience與科目所需coachId一起保留；名單維持正式版的可用額度優先呈現，加上科目待核對訊息。操作指南同時保留不限名額與同科目規則。

## 驗證與部署邊界

- 整合後35檔528項相關回歸通過、完整TypeScript（單次6GiB heap）通過。
- 本機明確loopback `_test` PostgreSQL：sports-card-modes／mixed-enrollment／companions／single-first-login共62項通過；音樂與運動購買→扣堂→還堂另4項通過，總計66項。其他3項核心情境未選，不寫成全檔7項通過。
- PR1540將座位併發案例擴為ASSIGNED／OPEN各一，整合PR1538後兩者都應使用已指定A科目的卡；修正OPEN測試舊fixture，不以未核對通用卡測座位規則。mixed工作流因此要求42項不略過，另驗首次登入6項及購買核心4項，保留測試內併發斷言。
- 真實React/CSS合成瀏覽器：同科目UI1440／1024／768／600及首次登入390／440／768各單人／多人共6情境通過，無pageerror或水平溢出。這些不是實體裝置或真人LINE首綁驗收。
- 原PR1538的隔離hosted扣堂、HTTP重送、還堂與舊卡核對證據保留；臨時QA政策已恢復。新整合不把舊QA SHA當成整合版hosted驗收。
- 無新增prisma／course-prisma／beauty-prisma migration或package變更。只讀Vercel metadata確認正式target沒有PRODUCTION_MIGRATION_TARGET，不啟動其他歷史遷移、不改正式卡片、會員綁定或通知設定。
- 正式專案為 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`，team `team_IAPnhzLHM4x540wiXg3lTyS9`。發布前網域指向READY `dpl_6XtQtyMtJLEa7i2MuASWQsEuUE2k`，source為上述main，可作前版比對。
- 只新增/保留功能分支的Git自動部署=false；main設定不變。合併後先等既有Vercel自動建置；必要時才對精確main SHA補一次正式建置，避免重複部署。檢查READY後才提升正式網域。
- Workers檢查在原正式main即失敗；本次網站由Vercel正式部署服務，不停用、不偽造Workers檢查。最終程式與PG CI另以整合head核對。

正式發布後只做公開頁與未登入入口的唯讀smoke，不代顧客提交正式預約、扣堂或綁定。既有未知科目卡及真人全新LINE驗收限制仍保留。
