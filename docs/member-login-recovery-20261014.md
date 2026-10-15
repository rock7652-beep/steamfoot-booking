# 會員登入與本店通知恢復草案

本批基底為 `5b6b030a`，獨立分支 `fix/member-login-recovery-20261014`。先查明以斯帖王小姐本次登入拒絕，再完成流程；不以電話或姓名相符搬移帳號。此文件是後台處理與工程驗收草案，未代表個案已修好或完整流程已上線。

## 個案證據與阻擋

父任務提供的現象為「會員已連結・本店通知尚未確認」，顧客進頁即被要求聯絡門市，未顯示姓名電話表單。既有 `provider=line` Account 與 CustomerIdentityLink、9/28 到期且未 consumed 的遷移授權僅為背景，不能證明本次登入使用同一身分。

`refreshLiffSession` 將 exchange 的 `IDENTITY_REVIEW_REQUIRED` 轉成待審畫面。`resolveVerifiedLineCustomer` 有六個拒絕分支：

| 原因 | 查核重點 |
| --- | --- |
| account_owner_conflict | 本次已驗證 Provider/subject 的 Account 與門市 Link 所有人不同 |
| store_membership_unconfirmed | 已驗證帳號無可確認的本店會員關係 |
| ambiguous_legacy_identity | 舊通知欄位命中本店多筆未合併顧客 |
| customer_owner_conflict | 顧客、門市、直接 owner 或合併狀態不一致 |
| store_membership_conflict | 所有人本店關係解析不到同一顧客 |
| account_unavailable | 所有人不存在或非 ACTIVE |

這條拒絕路徑沒有讀取 LineRebindRequest。因此，舊授權到期本身不能解釋此回應。門市摘要只依 owner 數量判定「已連結」，沒有驗證當次登入者；兩個畫面並不矛盾。

待父任務補充 `inspect_phone_binding_failure` 唯讀報告、本次已驗證的 Provider/subject 比對、精確拒絕原因及時間範圍。Vercel 11:00–11:20 沒查到紀錄不代表事件未發生。本工作區沒有正式資料庫設定，也沒有執行正式查詢或修補。尚不能列出安全且精確的目標資料列，因此尚未提出 grant 或安全關聯的執行批准。

## 本批已實作的診斷

身分拒絕改走既有 `logLineBindEvent`，輸出伺服器產生的 referenceId、Provider、已驗證 channelId、六種精確原因及 SHA-256 身分指紋。指紋輸入是 `[storeId, identityProvider, verifiedSubject]`，不同門市或 Provider 不共用；不記錄 token、原始 subject、電話或姓名。指紋仍是受限的診斷資料，不應公開或當作身分授權。

API 只回傳 referenceId，不回傳原因或指紋，不建立 session。現有前端仍顯示原待審訊息，尚未接入編號呈現。診斷不寫 DB、不變更會員、不追溯補造舊證據，發布後才有新紀錄；本批沒有發布。

## 既有修復與尚缺流程

#1327 的 `completeAuthorizedFirstStoreLogin` 已沿用本店唯一電話候選和有效首次 capture 授權；門市確認可為沒有 Login Account/Link 的既有會員建立一次性首次授權。不可另造第二套相同方案。

已定位的恢復缺口：`approveStoreMemberConnection` 對 APPROVED 申請直接返回；`captureStoreMemberConnection` 對仍一致的 APPROVED 關係直接回 linked。因此若首次 capture 未使用就到期，重複本店通知操作不會重新提供首次登入授權。這是程式碼上的缺口，尚未證明是王小姐個案根因。

## 完整流程設計待實作

| 情境 | 後台與顧客下一步 | 安全邊界 |
| --- | --- | --- |
| 正常回訪 | 驗證本次 token，沿用一致的本店會員，不重填電話 | 每次核對 Provider、門市、owner；不憑舊 cookie |
| 首次只有電話匹配 | 建立待確認申請，門市核对本人及手機確認碼 | 電話僅搜尋，不建立/搬移權限 |
| 無匹配或多筆匹配 | 顯示需要門市核對資料，不公開其他人的姓名 | 不任選一筆、不自動合併 |
| 電話更正 | 權限足夠的店員更正，顧客重新提交取得新的精確候選 | 舊 phone snapshot 的申請不可批准 |
| 門市完成首次確認 | 沿用 #1327 的有效且未 consumed 授權，接续首次登入 | Login 與 Messaging subject 不互相複製 |
| 首次登入授權已過期 | 增設正式「重新核對首次登入」操作，重新驗證本人與本次 Login 候選後建立有期限的新申請 | 不延長舊列，不只憑 APPROVED 通知關係自動補 grant；交易中核對仍無其他 Login |
| 已有 Login 但通道不同 | 明確標示 Login 與本店通知是不同關係，進入精確身分審核 | 不把首次 capture 當成更換 Login owner 的捷徑 |
| 身分待審 | 顧客可重試已完成修復的登入；門市依查核編號檢視受權限保護的原因與下一步 | 重試不代表核准；不解除原綁定 |
| 暫時網路或服务失敗 | 保留資料，提供稍後重試 | 不降級成無條件 onboarding |
| 跨店 | 使用目的店資料、通道及權限重新核對 | 不沿用另一店通知同意或修補 |

恢復操作實作時，交易須保留當次操作者、目標店/顧客/owner、Provider、候選指紋、舊狀態、核對證據、到期時間與結果；重試用 request ID 防重複，過期/consumed 狀態 compare-and-set，衝突不能留下部分 Account 或 Link。若要在正式個案執行新增授權或修改關聯，父任務須先取得針對確切列、動作與風險的當次批准。

## 三種狀態與各入口一致性

共用 `StoreMemberConnectionPanel` 應分別呈現：會員關係、已核對本店通知身分、目前通知路由可否嘗試。第三項沿用 `resolveVerifiedReminderLineRoute` 的既有規則；保留通知選擇、封鎖、通道、帳號一致性及發送時再查驗。READY 只能表示目前可嘗試，不能顯示「一定送達」。不為讀摘要而實際發送。

「已綁定」不能代表三種狀態皆成功。「輸入電話完成綁定」文案應改成「提交電話後，由門市核對本人完成連結」。本批精確字串搜尋未找到該舊句，仍需檢查真實入口、既有官方帳號選單與其他非程式文案來源，不可聲稱已全部修正。

獨立詳情、側欄、列表展開與手機入口應共用狀態和下一步；授權失敗時不得沿用另一顧客快取。#1329 已修改 `line-binding-section.tsx`、顧客列表/詳情容器及多個 LIFF 畫面，本批沒有修改這些重疊檔，整合時需與原 writer 協調。

## 驗證範圍

本批隔離單元測試 7 檔 128 項通過：診斷指紋隔離、六種拒絕理由與不發 session、既有 exchange、logger、session refresh、Login rebind、onboarding 及門市確認。這些皆使用測試替身，沒有真實 LINE/SMS 發送，也沒有使用正式會員資料。

完整驗收仍待實作及執行：正常回訪、首次體驗轉會員、錯電話更正、無/多筆匹配、已有連結但不同通道、過期授權恢復、身分待審、跨店、重試與雙請求、不同角色。UI 必須驗真實受影響入口，前台手機、後台桌機與 iPad、共用元件窄容器；合成 fixture 不可冒稱登入業務或真機驗收。竹北 11:19:41 已確認成功的個案不重開，通知送達也未驗證。

正式個案、完整恢復入口、三狀態 UI、瀏覽器及手機驗收未完成。本批不推送、不建立 PR、不合併、不部署、不補發過期提醒。
