# 音樂設定操作與局部載入

基底：PR #1317 的 1a07cecc 與統一導航 PR #1329 的 93b82d83。開始前核對遠端提交，工作區乾淨；沒有修改 main 或正式資料庫。

音樂與蒸足共用 SettingsWorkspaceFrame、SettingsWorkspaceNav、SettingsListRow、SettingsPanel及dirty/pending context。移除音樂自己維護的視窗外框；保留各模組的原有設定頁、权限與交易規則。

- 音樂分類及功能視窗用Next原生history整合維持URL，不呼叫router push/replace/refresh；沿用門市/HQ作用範圍，保留背景查詢、分類與hash。乾淨返回鍵可恢復網址；dirty/pending返回先保留目前內容並確認。
- props已有的行內設定及直接網址初始內容不額外讀取。需資料的視窗透過OperationScope內的usePanelReader（TTL0）讀取既有server頁，保留目的頁授權；同鍵在途請求去重、舊回應取消套用、store receipt核對、失敗局部重試與render error boundary。
- 儲存確定後以後端receipt更新基準與畫面，行內store/payment/booking/trial/waitlist收合；視窗表單完成後關閉，其他行內草稿保留。無修改取消立即收合，有修改才確認。已有request lock與uncertain結果不被清空。
- 推薦文案、數位管家草稿及方案提醒新增共用settingsSavePOST JSON transport，沿用原action後端檢查，不發RSC頁面回應。文案使用canonical receipt解除dirty；草稿使用後端trim後名稱與confirmed definition；提醒逐列用receipt保留部分成功及其他草稿。
- 建立/發布數位流程等既有管理action仍維持後端檢查與來源頁失效；Panel中不追加router.refresh。方案清單儲存一列只收合那列，不捨棄其他列草稿。

量測：開啟到下一frame為open、局部內容到達為read、server頁readMs、HTTP送出至receipt為responseMs、receipt至下一frame為paint-after-receipt。這些frame量測不是完整首屏Web Vital，亦不表示第一次讀取零等待。現有共用settingsSavePOST記錄伺服器totalMs；未把動畫移除作為速度證據。

等待來源核對：原功能開啟/關閉重新讀整個CourseSharedHub（門市、授權、用量與所有分類摘要）；新流程關閉不讀取，開啟只渲染目的設定頁。原文案儲存基準仍用initialTemplate，現改為canonical receipt。fixture原本漏了CSS module，已補齊後重新驗證，不把測試缺樣式當產品疊層錯誤。

驗證入口：設定五類、提醒/推薦/數位功能入口、局部read錯誤、未開通/權限撤回、跨店、跨origin、晚到回應、StrictMode去重、canonical文案與連點提交。合成Chromium36組分類/授權/模組/尺寸，加dirty/成功關閉、重開、resize與零router呼叫。尺寸1366、1440、1024×768、768×1024、767及560px。授權及receipt均有真正元件/handler互動測試。結果位於/tmp/course-settings-three-state-qa，僅合成資料，不等同登入業務或實體Safari驗收。

登入後音樂業務驗收尚待可用測試帳號；既有蒸足種子帳號不具音樂門市存取權，不能用它算音樂儲存驗收。部署限定隔離Vercel Preview、測試DB、通知封鎖、migration跳過；不合併正式站。

其他待辦：卡片重疊、教師資格批選（本次不實作）。

合成量測：兩次開啟各14/16ms（下一frame），讀取stub各5/2ms；2次開啟共2次reader呼叫，取消確認/儲存關閉沒有router呼叫。這些是fixture資料，不是實際網路或DB時間。另移除推薦文案receipt後等待個人模板使用紀錄的串行步驟；紀錄獨立執行，不拖延已确认儲存狀態。

登入實測：隔離音樂測試店Owner可登入。dfee4fb6推薦視窗外框80ms、局部讀取1137ms、整頁navigation=0；店家資料連點兩次只有一次JSON寫入，其他分類银行草稿保留，成功收合，還原店名及捨棄銀行草稿後dirty清除。response約1.1–1.4秒、receipt後下一frame約1–8ms。d5cd15a2推薦文案成功關閉、重開讀到保存內容、原文案及原預設狀態已還原；保存response1377ms、還原783ms，整頁navigation=0。這些樣本含網路時間，不代表全站所有設定時間。

真實返回測試發現Next先處理popstate並卸載視窗，原listener尚未執行；手動dispatch的unit未能重現。共用Panel在dirty/pending時使用同URL保護entry，先保留實際編輯內容再確認，捨棄才完成原生遍歷；沒有本地前一位置的直接網址改為原地關閉。新增真正Chromium history遍歷fixture，36案例與返回流程通過，後續部署仍需登入重驗。設定讀取亦轉換目的頁的Next notFound/redirect為局部錯誤，不將權限拒絕變成主頁跳轉。

0cc1d466登入重驗：返回鍵dirty保護通過；1366×900、1440×900、1024×768、768×1024、560×768皆無整頁溢出，草稿保留且關閉可到達。直接URL已有內容額外reader=0、無修改關閉reader=0；唯一document load是驗收明確goto直接URL，不是內部切換。

額外RSC讀取定位：`x-action-revalidated=1`來自proxy重寫相同store-slug context cookie。只在courses/settings的同scope Server Action省略同值context cookie寫入；GET續期、切店、認證cookie、強制request header及後端權限維持原樣。此修正包含HQ與店家case及偽造HQ拒絕測試。局部讀取加Suspense以隔離Server Component/程式chunk等待，初始化seed只採一次，背景RSC props不能重置編輯器。

補齊體驗後關懷設定guard、in-flight lock及JSON canonical rules回寫/收合；數位流程建立、草稿、發布、啟停在local setting用JSON transport，保留原service驗證。切換流程/觸發另一內部操作前沿用共用discard確認，不另做音樂UI。停止個別顧客後續關懷是日常顧客處置，沿用原有權限与同步，未重構其業務紀錄模型。
