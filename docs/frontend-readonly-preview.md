# 前台唯讀預覽

本輪：會員首頁、我的預約、方案餘額、課程教練與 SPA 技師工作頁。使用真正前台元件；只允許查閱、換日、換月、展開卡片及分頁。SPA 已接入，跳過畫面驗收，保留功能、權限與資料隔離測試。

## 授權與入口

- 後台 `/dashboard/frontend-preview` 搜尋店家、角色、人員；會員／人員詳細資料可直接進入。
- 另有 GET-only `/frontend-preview` 呈現前台。每次讀取檢查後台登入、customer.read、booking.read、店家存取範圍及 frontend_preview 功能授權。
- 會員頁另檢查 wallet.read，沿用 manager visibility；工作頁需 OWNER／ADMIN 與 staff.view，限選定店家有效人員，課程需 courseCoachEnabled。
- frontend_preview 是獨立 HQ 加購，不受 device_preview 或試用／系統方案預設開通。使用既有 StoreFeatureEntitlement 字串鍵，不需要資料庫遷移；未設定則鎖定。
- HIDDEN 不顯示入口；LOCKED 顯示未開通；ENABLED 才讀取個人資料。原有隔離 SPA Demo 授權例外保留。
- 店家模組依現有 getStoreIndustryModule 的單一有效模組決定，不增加新的多模組授權模型。

## 寫入隔離

不偽造顧客／LINE session，不寫入 customerId cookie，不修改管理員目前店家。純讀取 projection 抽至 server-only queries，真正會員 action 仍先驗證原本身分再呼叫同一 query。

課程共用 run() 在預覽模式禁止儲存。表單捕獲禁止送出，對外或真正前台連結被攔截。Proxy 拒绝預覽路徑的所有非 GET/HEAD，並拒絕以預覽頁為 Referer 的寫入，涵蓋 Server Action、表單及 API。此層是操作防護；資料安全仍由後台 store/person 權限決定，Referer 不用來授予權限。

SPA 工作頁直接注入同一 query 的唯讀資料，換日／月走 GET，不啟動 LIFF SDK、不更新身份偏好。課程預覽的角色切換不修改正式前台偏好 cookie。

## 資料與驗收

- banner 顯示查看店家／人員、最後讀取時間；未綁定帳號標記為僅畫面資料驗證。
- 每次 GET 記錄 viewer/store/person/module 於伺服器 log，不含電話、金額或備註；本輪沒有新增持久稽核事件類型。
- 預覽搜尋最多 30 筆；會員預約／方案沿用真正前台查詢上限與排序。
- 不載入健康、收入、推薦分享、消費紀錄；唯讀方案頁隱藏未載入的消費分頁。
- 預覽不驗證 LINE 綁定、真正登入或真實預約提交；這些需獨立驗收。
- 模擬預約、付款、扣堂、取消，以及外部展示假資料模式，均留待下一輪。

發布須完成 desktop/iPad 預覽驗收與使用者正式合併授權。先建立 Draft PR，未經確認不合併正式站、不開通正式店家的新加購授權。
