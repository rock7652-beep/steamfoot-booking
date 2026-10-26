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


## 2026-10-26 LINE 管理端實際核對後的根因補正

登入 LINE Developers 後已確認：

|用途|Channel|Provider|目前入口|
|---|---|---|---|
|暖暖通知官方帳號 @083vmikb|2010835815|2005377483|Messaging API|
|暖暖公開體驗|2010761154|2005295754|LIFF 2010761154-i4DO3oFO → https://www.steamfoot.com/s/zhubei/trial-booking|
|暖暖會員中心|2010761154|2005295754|LIFF 2010761154-duGBs1Ng → https://www.steamfoot.com/s/zhubei/liff|

體驗與會員入口同 channel 沒錯，但通知 OA 在另一 Provider。同一個人的 notification subject 和 Login subject 因而不同；前版只做 exact-notification activation，不足以修好暖暖正常新客。原公開體驗 bridge 又以通知可送達作為 Login 入口的必要條件，遇到這類情況會丟棄有效 Login 證據。不能再把此情況全部歸為人員誤填或帳號衝突。

官方依據：https://developers.line.biz/en/docs/messaging-api/getting-user-ids/ 。本輪未修改正式 Provider、channel、LIFF endpoint 或圖文選單。

### 新增修正

- 公開體驗仍先驗證 ID token 的 issuer、audience 與有效期。有效 Login 證據會封裝在既有 AES-GCM 一次性入口中；通知探測成功與否另存，只有 COMPATIBLE 才能作通知收件人。
- 新 Login 能力連結使用 id.secret.login1 格式，版本也算入 token hash。舊部署因格式不符會拒絕，刪除版本尾碼也無法通過 hash；回滾時不會把加密內文誤作 LINE 通知身分。既有兩段式 LINE／Messenger 聊天入口不變。
- 新的 public-trial-login-customer 服務在 Serializable 交易建立真正新客的 User、Account、CustomerIdentityLink 與 Customer，或重用已驗證的同店連結。重複電話、不同 owner、失效入口、停用帳號或歸屬不一致會阻擋；不靠姓名電話認領舊資料。跨店已有中央帳號的新店會員可沿用同一個已驗證 Account，透過店別 IdentityLink 建立會員關係。
- 註冊與身分建立獨立於付款；預約仍檢查時段／名額並原子消耗入口，財務流程不變。與原行為一樣，若後續名額不足，已建立且身分合法的顧客可保留以便重試；不會建立收款或方案。
- 通知綁定只對本次新建的顧客簽發一次性私密能力，並將 Login owner 的雜湊綁入 digest。OA webhook 完成通知時，必須仍為原 ACTIVE Login owner；只改通知欄位，保留登入 Account／IdentityLink。既有 trial token 的 null-owner 限制保留。
- server-only 的隔離驗收 LIFF 覆寫只允許本支線、zhubei、Vercel Preview、同一 Login channel；同時驗證 DATABASE_URL 與 DIRECT_URL 都是原隔離庫。正式站忽略這兩個測試 ID，正式網址不變。

### 本輪驗證與尚待條件

12 組相關測試共 214 項通過，含 AES-GCM 真實加解密、篡改／過期／重放／回滾版本拒絕、跨 Provider Login 保留、通知能力 owner 固定、舊聊天入口相容、重複電話／Account／店別隔離及原開卡登入路徑。型別、ESLint 與新版部署需以本輪最終 commit 核對；前一版 CI／Preview 及一般表單建檔→499 體驗收款→1000 元五堂開卡的 hosted 測試只作前段回歸證據，不能作新增跨 Provider Login 通過。

需建立兩個專用隔離 LIFF（體驗、會員），放在原 Login2010761154 下，以 openid／profile、Full、Add friend Off 設定指向本分支固定 Preview alias；不勾 chat_message.write、不取代正式 LIFF。兩個建立表單已備妥，尚未送出。測試站仍須使用已授權的 23 小時臨時存取；若在 LINE endpoint 使用此 bearer 存取能力，應明確確認其存取範圍與期限，不把分享參數寫入 git 或公開 PR。

真實手機 LINE 完整流程及真正衝突例外未通過前保持 draft，不合併、不部署正式站。
