# 中央身分入口規則（PR-1）

## 目的與邊界

中央化的是「同一位顧客的登入身分」，不是各店營運資料。`User`／`Account` 是中央登入主體；`CustomerIdentityLink` 對應該身分在各店各自獨立的 `Customer`。

本 PR 只建立共用、無寫入的判斷規則與測試，不接管任何入口、不修改 Production 資料，也不合併 Customer。方案、堂數、預約、付款與交易仍以 `storeId + customerId` 隔離。

## 現有入口盤點

| 入口 | 現況 | PR-2 接線目標 |
|---|---|---|
| LINE OAuth／LIFF | 多數成功路徑已建立 `CustomerIdentityLink`；已有同店與舊 `userId` 衝突防呆 | 全部成功路徑進入同一政策，既有 link 直接沿用 |
| Google OAuth | 仍以 `Customer.googleId`、email 與 OAuth callback 內的舊分支為主；程式明載 Google convergence 尚未處理 | 已存在中央 Account 時沿用同一 User；找舊 Customer 必須再有手機所有權證明 |
| 手機＋密碼 | 依 `storeId + phone` 找 `Customer.user`；手機有正規化，但尚未統一建立 store-scoped identity link | 密碼驗證後視為已驗證 provider；同一 User 可建立／沿用該店 link |
| 店長後台建檔 | 只建立該店 Customer，同店手機防重 | 維持店內資料；不可僅因店長輸入相同手機就自動跨店合併 |

## 統一決策規則

1. LINE、Google、手機密碼都必須先完成各自的登入驗證；未驗證不得建立中央連結。
2. 已存在且指向同一 Customer 的 `CustomerIdentityLink` 直接沿用，不用再以手機猜測。
3. 已登入的中央 User 加入沒有既有 Customer 的新門市，可建立該店獨立 Customer 並連到同一 User。
4. 要認領既有但尚未綁定的 Customer，必須再驗證正規化手機所有權；同手機本身只算候選，不算本人證明。
5. Customer 已屬於同一 User 時可以補齊 store-scoped link；若屬於另一 User，轉人工確認。
6. 同店有多筆候選、既有 link 指到另一 Customer、或候選已被 merge，全部轉人工確認，不自動挑一筆。
7. 店長建檔只建立店內 Customer，不建立中央 User 關係；待顧客本人驗證登入後再連結。
8. 身分連結只改身分層；不得搬移或共用方案、堂數、預約、付款與交易。

## 手機正規化

所有入口沿用 `normalizePhone()`，將 `0912-345-678`、`0912 345 678`、`+886912345678` 與 `886912345678` 正規化為 `0912345678`。格式正規化只解決比對格式，不等於手機所有權驗證。

## PR-2 的最小接線順序

1. 手機密碼：驗證密碼後補齊 `CustomerIdentityLink(provider=phone)`。
2. Google：移除跨店改寫 `targetStoreId` 的舊行為，改以中央 User 加上目前門市建立／解析 membership。
3. LINE／LIFF：將分散成功路徑統一呼叫政策，保持既有原子交易與衝突拒絕。
4. 店長建檔：只顯示「可能為既有中央會員」提示；不自動連結。

每一步都必須加入跨店隔離回歸測試，並保證失敗時不留下只寫一半的 User、Account、Customer 或 CustomerIdentityLink。
