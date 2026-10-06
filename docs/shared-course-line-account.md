# 課程門市共用官方 LINE

UFUN 新莊與板橋共用 `@gve3723w`（Messaging API channel `2011889316`），但會員關係、方案與預約仍依 `storeId` 隔離。

## 部署設定

在伺服器的 `STORE_LINE_CONFIG_JSON` 分別登記兩店。沿用既有設定格式，兩筆增加相同的 `sharedAccountKey: "ufun"`。

- 新莊：`storeId: "store-ido-xinzhuang"`、`slug: "ido-xinzhuang"`。
- 板橋：`storeId: "store-ido-banqiao"`、`slug: "ido-banqiao"`。
- 同組必須有相同的 Provider、Login channel、Messaging channel、Basic ID、bot destination、Token 與 Secret 環境變數名稱，以及 identityMode。
- 使用中央會員登入時設 `identityMode: "CENTRAL"`，並核對 `CENTRAL_LINE_PROVIDER_ID`；不能僅憑 Provider 的顯示名稱。
- 兩店可使用各自的 LIFF ID。同組亦可共用 LIFF ID，但入口必須保留門市路徑，不可省略門市或依第一筆設定猜測。
- Token、Secret 僅放在 server-only 部署環境變數；JSON 只保存變數名稱，不保存憑證。不得以 `NEXT_PUBLIC_` 變數儲存。
- destination 必須以該 Token 查詢 LINE bot info 所得的 bot userId 核對，不能使用管理員的 Your user ID。
- 共用 OA 不寫入兩筆 `Store.lineDestination`：該欄位沿用既有唯一索引。Webhook 依部署設定解析共用組。
- 核對設定與部署完成後才啟用 `/api/line/webhook`；本 PR 不含正式環境憑證或試用啟用。

## 事件與門市隔離

Webhook 先驗證該 OA 的簽章，再核對組內所有門市都是相符的 COURSE 店。任何門市不匹配都不處理事件，也不轉入舊的電話綁定。

follow/unfollow 更新每店已驗證的 CustomerIdentityLink 對應會員。未知好友不建檔、不綁定；重送事件保留時間順序條件。一般聊天不猜測門市、不觸發舊的綁定流程。顧客透過新莊或板橋的專屬預約入口決定門市。

## 上線驗收

1. 用各店入口登入，確認門市名稱、課表、方案、預約與會員資料均限該店。
2. 同一 LINE 加入另一店時，確認會員關係獨立，不能看到另一店的方案或預約。
3. 用測試會員確認兩店通知都由 UFUN 官方帳號發出，訊息與連結保留正確門市。
4. 封鎖／重新加入時只更新組內已驗證會員，沒有會員關係的店不建檔；其他官方 LINE 不受影響。
5. 完成入口驗收後才開通各店的 30 天試用。

本地自動測試不代表真實 LINE／正式站驗收。
