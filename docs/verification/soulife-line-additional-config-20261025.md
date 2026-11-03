# 舒生活獨立 LINE 設定準備

## 目的與現況

保留 Production 的 `STORE_LINE_CONFIG_JSON` 原值，不需要解密、替換或重建其他店家的設定。
新增 `STORE_LINE_ADDITIONAL_CONFIG_JSON` 作為另一個設定來源，內容使用相同的 JSON 陣列格式。
兩份資料合併後執行原有完整驗證；重複店家、跨店識別衝突、未明示的共用 OA 或不相容通道一律拒絕，不能藉新增來源覆蓋舊設定。
未提供新增來源時，既有解析結果維持原樣。變更只有伺服器設定解析與美容模組 LIFF 檢查，沒有 UI、migration 或正式資料異動。

使用者已於 LINE Console 建立以下入口，並回報在 Vercel 保存兩個 Production Secret。
下列資料來自對話與截圖，尚未透過正式環境 API／資料庫驗證。

| 項目 | 值 |
| --- | --- |
| 預期 Store ID / slug | `store-soulife` / `soulife` |
| Provider | `2005295754`（蒸管家） |
| LINE Login channel | `2010761154` |
| Messaging channel | `2012197466` |
| OA Basic ID | `@046mqwnp` |
| bot userId / destination（使用者回報查詢結果） | `Uec3fa0f9f44e06537c198f132da5a531` |
| LIFF | `2010761154-CmcQZ9Db` |
| LIFF endpoint | `https://www.steamfoot.com/s/soulife/liff` |
| Access token 環境變數名稱 | `LINE_SOULIFE_CHANNEL_ACCESS_TOKEN` |
| Channel secret 環境變數名稱 | `LINE_SOULIFE_CHANNEL_SECRET` |

## 正式設定前仍需核對

1. 以有權限的環境唯讀核對 Store ID、slug、`industryModule=BEAUTY` 及既有 `Store.liffId`。不覆蓋不相符的既有 LIFF。
2. 使用者已回報以舒生活 token 呼叫 LINE `GET https://api.line.me/v2/bot/info` 的結果：`basicId=@046mqwnp`，`userId=Uec3fa0f9f44e06537c198f132da5a531`，格式檢查通過。這是使用者提供的 API 查詢結果，代理尚未獨立以 LINE API 核對。正式預檢仍需驗證 token 對應該 bot。這不是管理者的「Your user ID」。不要將 token、secret 或原始回應寫入 Git／聊天／log。
3. 確認中央 Login 所屬 Provider 與 `CENTRAL_LINE_PROVIDER_ID` 目前的實際設定。共用既有中央帳號時，使用 `identityMode=CENTRAL` 且必須與既有中央 Provider 相同；不得為了通過檢查任意覆蓋該值。使用 PROVIDER 模式會另開身分命名空間，不應用來繞過中央設定核對。
4. 確認新增來源尚不存在；若已有內容，必須保留並追加，不能覆蓋。Production 與 Preview 各自處理，不將正式 token 複製到一般 Preview。

上述核對完成後，新增來源中舒生活的項目欄位為：
`storeId, slug, identityMode, providerId, loginChannelId, messagingProviderId, messagingChannelId, liffId, basicId, destination, accessTokenEnv, channelSecretEnv`。
實際金鑰只放在其引用的兩個 Secret；JSON 不含金鑰本體。使用者回報 bot 查詢結果後，新增 `soulife-line-additional-config.json` 作為待核對候選值；不代表已在 Vercel 保存或部署。
Production 已有不可讀回的 `CENTRAL_LINE_PROVIDER_ID`，保留原值，不再要求使用者解密。新 build 的 `store-line-additions-preflight.ts` 在任何遷移與 Next build 之前使用部署環境原值解析兩份設定；缺漏、衝突或中央 Provider 不符會以不含值的訊息阻擋建置。
透過 npm `prebuild` lifecycle 執行，保留原 `build` 命令及其檢查順序。預覽精確登記本次 `codex/soulife-line-additional-config` 分支，仍要求原隔離庫、正確 repository provenance、Preview target 及禁止外發通知，不放寬其他分支。

## 部署與驗收界線

- 應先將本次程式修改部署至經授權的環境，僅新增環境變數並重新部署舊版程式不會支援新來源。
- 正式發布前以原有設定加新增來源執行解析與帳號核對，確認其他店家結果不變；無效新增資料會讓整體設定檢查拒絕，須先完成預檢。
- 設定完成後的 Webhook 路由為 `/api/line/webhook`；正式網域與部署確認後才在 LINE Console 保存完整 HTTPS 網址並 Verify／開啟 Use webhook。
- 驗收包括舒生活 LIFF 入口、既有同店會員登入、同店 CustomerIdentityLink、follow/unfollow、指定測試會員的通知路由及單次送達。不得以 HTTP Verify 成功當作通知送達。
- 本次美容模組修改只允許已註冊配置通過 LIFF context 檢查；沒有新增美容顧客的自動入會流程。新顧客公開預約、入會、身分連結及完整提醒仍須另外實測，不能把課程入會規則直接套用到美容模組。
- 不自動開啟店家通知開關或發送測試訊息；真正送出前需指定收件人與測試內容。
- 本次未修改 Vercel、LINE Console 或正式資料庫，尚未完成正式串接。

回復方式：在部署平台移除本次新增的來源，或將其設為空陣列後使用已知正常版本重新部署；原共用設定保留。若尚未完成真人驗收，不對外發布入口。

## 本機驗證

- 8 檔／111 項 Vitest 通過：設定解析、LIFF context、官方帳號核對後發送、Webhook 分店隔離、通知身分路由、follow/unfollow、建置前中央 Provider 核對、隔離預覽拒絕正式／錯誤連線及錯誤 provenance。
- 修改的 TypeScript 檔 ESLint、全專案 `tsc --noEmit --incremental false`、`git diff --check` 通過。
- LINE 網路請求與資料庫在以上測試中使用 mock；不代表正式帳號、真人登入或通知已送達。
- 第一版 CI 的 targeted suite 顯示 16 個失敗，兩個與本次變更有關的 build 字串斷言已藉保留原 build chain 解決；其餘失敗位於 SPA 舊測試、營收、指南、身分／資料庫 mock 等非本次修改範圍。尚未進行對照基線重跑，不把它們認定為已證實的既有失敗，也不將整體 CI 標記通過。
