# 中央會員 PR-1：唯讀準備度與身份契約

## 目標

同一位自然人在不同門市保留各自的 `Customer`（方案、預約、交易仍由門市隔離），但使用同一個已驗證的登入主體進入各店資料。

PR-1 不建立第二套帳號系統。現有全域 `User`／`Account` 是登入主體，`CustomerIdentityLink` 是該登入主體與各店 `Customer` 的已驗證關係。

## 不可混在一起的資料

| 資料 | 層級 | 規則 |
| --- | --- | --- |
| `User`／`Account` | 中央登入 | LINE、手機密碼與過渡期 Google 可歸到同一 User |
| `CustomerIdentityLink` | 中央登入 × 門市 | 一個 User 可在多店各連一筆 Customer |
| `Customer` | 單店營運 | 方案、堂數、預約、交易、店內備註不跨店合併 |
| `Customer.lineUserId` | 單店通知 | 仍配合該店 Messaging API，不等於中央 LINE Login 本身 |

## PR-1 安全界線

- 新增 aggregate-only 唯讀盤查，不修改 Production。
- 不以相同手機自動連結；電話只能產生人工確認候選。
- 不自動合併 Customer，不搬方案、預約、交易或堂數。
- 不切換 LINE Login、不移除 Google 入口。
- 不新增 schema 或 migration。
- merged source 不計入有效會員。
- `CustomerIdentityLink.storeId` 必須與 Customer 所屬店一致，否則列為 drift。

## 分階段計畫

1. **PR-1（本 PR）**：中央會員身份契約、唯讀 aggregate audit、read-only regression guard。
2. **PR-2**：中央會員 resolver。登入後列出該 User 已驗證連結的門市，不以電話 fallback 自動認領。
3. **PR-3**：既有顧客安全認領。以手機密碼或一次性驗證完成所有權驗證後，才建立跨店 link；衝突進人工流程。
4. **PR-4**：中央 LINE Login 入口。各店 Messaging API 保持獨立，登入與通知 channel 分離。
5. **PR-5**：少量真實會員試跑、drift audit、登入與通知驗收。
6. **PR-6**：先隱藏 Google 登入按鈕，保留 callback 過渡期；確認無遺漏後才關閉 Google provider。

## 驗收指標

執行：

```bash
npx tsx scripts/audit-central-member-readiness.ts
```

輸出只包含總數：有效 Customer、已驗證連結覆蓋率、跨店 User 數、跨店同手機候選／衝突群組、錯店 link 數及 provider link 數。不得輸出姓名、電話、Email、Customer/User ID、provider account ID 或 token。

## Production 唯讀基線（2026-07-21）

| 指標 | 數量 |
| --- | ---: |
| 有效單店 Customer | 217 |
| 已有可驗證 identity link 的 Customer | 117 |
| 尚無可驗證 identity link 的 Customer | 100 |
| 已由同一 User 串起多店 | 3 |
| 跨店同手機人工確認候選 | 7 |
| 候選中已有不同 User 衝突 | 1 |
| store/customer 不一致的 link | 0 |
| LINE links | 116 |
| Google links | 1 |

此基線僅使用 aggregate SQL；未輸出或保存姓名、電話、Email、Customer/User ID、provider account ID 或 token。Google `Account` 不等同每店已驗證的 `CustomerIdentityLink`，因此 Google link 數不可直接拿來推算 Google 登入人數。
