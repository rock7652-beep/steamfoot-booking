# 中央身分 PR-2：驗證入口接線

## 目標

將 PR-1 的唯讀判斷規則接到實際登入成功路徑。中央化的仍只有登入身分；每店 `Customer`、方案、堂數、預約、付款與交易不共用。

## 接線結果

| 入口 | PR-2 行為 |
| --- | --- |
| 手機＋密碼 | 密碼驗證成功後，建立或沿用該店 `provider=phone` 的 `CustomerIdentityLink` |
| Google | 優先依目前門市的已驗證 link 找 Customer；不再因他店舊 `googleId` 改寫目前門市 |
| Google 加入新店 | 沿用既有 Google Account 所屬的中央 User，建立新店獨立 Customer 與 store-scoped link |
| LINE／LIFF | 保留既有原子綁定與 `CustomerIdentityLink` 寫入；沿用 PR #487 的舊 `userId` 衝突拒絕 |
| 店長建檔 | 維持只建立店內 Customer，不因相同手機自動跨店合併 |

## Fail-closed 規則

- 同店同 provider 已連到另一位 Customer 或 User：拒絕自動轉移。
- Customer 屬於另一個舊 `userId`：轉人工確認。
- merged Customer、store/customer 不一致：拒絕寫入。
- 同一 Customer 的同 provider 已使用不同 provider account：轉人工確認。
- 手機格式相同但未完成密碼驗證：不得建立 phone link。
- Google User、Account、Customer 與新 link 的新建路徑置於同一 transaction；失敗整組回滾。

本 PR 無 schema 或 migration，也不批次修改既有 Production 顧客資料。
