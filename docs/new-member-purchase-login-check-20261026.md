# 新客首次會員登入修正（2026-10-26）

## 問題與證據

目前公開體驗 LIFF 與會員 LIFF 都隸屬 Login channel 2010761154；舊文件中的 2011147985 不代表現行程式設定。Messaging API 與 Login 的實際 Provider 對應，不能僅憑 channel 不同推定。公開表單可來自 LIFF、店家聊天一次性連結或一般瀏覽器，各入口證據不同。

正式資料唯讀盤點：近 30 天三店共有 13 筆登入確認申請（竹北 7、新竹 3、台中 3），不是 13 次全部登入失敗率。兩筆新竹簽名體驗入口建檔的顧客，保存的通知身分與申請的已驗證登入身分完全相同，但沒有 User、Account 或 IdentityLink，仍停在人工確認。現有 exchange 對此回傳 onboarding，首次啟用還依賴再次輸入姓名與手機。不能由現存申請還原當時輸入的姓名，故不將姓名拼字宣稱為已證實的個別失敗原因。

田小姐的通知與登入 subject 不同，是另一類：已依使用者確認本人之授權完成單筆恢復；本次不自動覆寫這類身分，不以此個案代表所有新客。

## 修正行為

蒸足會員入口先驗證新鮮 LINE token、門市與 channel。若尚未找到會員登入，使用同店完全相同且 LINKED 的通知 subject 尋找唯一未持有帳號的顧客；不接受瀏覽器輸入姓名或手機作為這條路徑的身分證據。原顧客沿用，於 Serializable 交易中建立 User、LINE Account、同店 IdentityLink 及稽核。保留原通知 subject、預約、收款與方案；不新增 Customer，也不修改錢包。

成功後重讀已提交的會員歸屬，再由原 Credentials provider 二次驗證 token 建立 session。已開啟的 onboarding 表單亦可使用同一條已驗證身分路徑。交易或歸屬重讀失敗不宣稱登入成功。

以下維持原核對流程：不同 subject、既有帳號或電話歸屬衝突、已合併或多筆資料、已核准解除會員連結、有效恢復授權、尚未綁定通知。跨店既有中央帳號的加入亦沿用原流程，本次不移轉既有登入憑證。課程與美業不啟用本服務。

已移除本 PR 原先新增的普遍開卡後人工核准 UI。只以必要的例外核對處理衝突。

## 驗證與發布條件

服務交易、exchange、onboarding、既有首次啟用、身分歸屬、Credentials、登入恢復及 Preview 隔離等 10 組測試：217 項通過；新增測試涵蓋原 Customer ID、自動 session 路由、LINE 不符、模組隔離、既有帳號、解除連結、有效授權、競爭更新與寫入失敗。TypeScript noEmit 與變更檔案 ESLint 通過。這些是 mock 自動測試，不能證明真實 LINE／收款／方案顯示。

分支沿用 fix/new-member-purchase-login-check-20261026 的隔離 Preview 規則，兩個資料庫連線均須指向 steamfoot-preview；不得送出正式通知或執行正式 migration。先前手動確認 UI 的 Preview 不代表新版驗收。

尚待：新版 Preview 建置、真實「公開體驗送出 → 到店收款／開卡 → 同一 LINE 登入 → 顯示原方案」，以及身分衝突例外驗收。Preview 後台受到 Vercel 驗證保護；使用者先前未完成安全登入表單，未繞過或關閉保護。保持 draft，完整流程未通過前不合併、不部署正式站。
