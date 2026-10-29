# 登入後隔離 Preview 驗證（2026-10-29）

受測程式版本：`331827d7fa853c9b1efedcb1b94805fd9d4c3ea5`。

受測部署：<https://steamfoot-booking-38zp89z80-rock7652-2111s-projects.vercel.app>，原 Vercel 專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`。

使用者完成正常 Vercel CLI 登入後，以原專案 development OIDC、僅限此 Preview origin 的認證標頭存取；未變更 Deployment Protection、未建立分享／bypass 連結。應用程式使用新建的 QA1465 合成帳號，經一般 Email／密碼登入，未偽造 session 或跳過授權。

## 完成項目

- OWNER 在顧客抽屜確認解除 A；主檔變為 UNLINKED、lineUserId 清空、LINE CustomerIdentityLink 由 1 變 0。重新開啟抽屜顯示未綁定，可在同頁實際產生新綁定碼。
- ADMIN 以一般登入在原頁解除獨立顧客 D，畫面更新未綁定；沒有導航離開顧客清單。主檔與身分關聯同樣同步。
- OWNER 使用真正已驗證 session 呼叫同一 Server Action 操作跨店 C，後端回傳「無權存取其他店舖的資料」。
- STAFF 即使有刻意保留的 `customer.identity.rebind` granted 勾選，仍不提供取消按鈕；同一正常 session 直接呼叫後端操作 B，回傳「僅限負責人或管理員解除 LINE 綁定」。沒有靠隱藏按鈕充當後端授權。
- AuditLog 確認 OWNER→A、ADMIN→D 各一筆 UNLINK_CUSTOMER_LINE；沒有 STAFF 寫入。
- 缺少測試 LINE 通道設定時，重新綁定維持阻擋，沒有借用其他門市的 bot、Provider 或通道。

## 遠端資料庫前後比對

只在既有 `steamfoot-preview`（`ttworfzgwejdeolegkxl`）的 staging／QA 店建立合成 fixture，不接觸正式資料庫。A 的三類記錄皆非空，且整筆列內容摘要前後相同：

| 目標 | 前 | 後 | 完整列內容摘要（前後相同） |
| --- | --- | --- | --- |
| A 預約 | 1 | 1 | `1cbb66cf36281cce5514c46537b95df9` |
| A 方案錢包 | 1 | 1 | `cde583b4dea1c26f4353c3d1990f1273` |
| A 消費交易 | 1 | 1 | `6bb22a3f00e9a65d63d08db3a50ac0be` |
| B LINE 主檔／身分關聯 | LINKED／1 | LINKED／1 | 未受 A 操作或 STAFF 拒絕測試影響 |
| 跨店 C LINE 主檔／身分關聯 | LINKED／1 | LINKED／1 | 跨店拒絕後不變 |
| D LINE 主檔／身分關聯 | LINKED／1 | UNLINKED／0 | 僅 ADMIN 正常操作成功 |

摘要為 `md5(jsonb_agg(to_jsonb(row) order by id)::text)`，比較整筆列而不只是記錄數量；此處只用於變更偵測，不用於密碼或身分安全。

## 真實 Preview 的 RWD 幾何／觸達驗證

1366×900、1920×1080、1024×768、768×1024、560×800、390×844、360×800：七組均無整頁／抽屜水平溢出，取消確認按鈕 108×44 且可捲至及點擊。無 pageerror。詳見 [量測與操作結果](results.json)。

- [桌機](desktop.png)
- [iPad 尺寸](ipad.png)
- [手機尺寸](mobile.png)

以上為登入後實際 Preview＋Chromium 視窗尺寸模擬，不是實體裝置、Safari 或 LINE LIFF 驗收。全頁截圖包含視窗外原清單，不能以截圖下方背景清單判定它覆蓋了目前視窗內按鈕。

實際畫面另觀察到「本店會員與 LINE」狀態區塊重複呈現；目前來源檔僅一處掛載，尚未完成原因核對。因此七組僅列幾何／觸達通過，不將完整視覺驗收標為完成。

## 收尾及限制

- 臨時 OWNER／ADMIN／STAFF 帳號已 SUSPENDED、清除 passwordHash，兩個臨時 Staff 已 INACTIVE；相關 session 依既有 stamp 驗證失效。本機暫存帳密檔已刪除，沒有將密碼、token、cookie 或 action reference 存入證據。
- 已作廢 A 的測試綁定碼。合成顧客、方案、預約、消費及稽核記錄保留，未以清理為由刪除業務歷史。
- CLI 包裝執行曾誤建獨立 `pr1465-oidc-probe` 專案，已立即刪除並以 404 確認不存在；原蒸管家專案與正式站未變更。後續改用已驗證 CLI 直接路徑執行命令。
- 真正的 LINE 重新綁定尚未完成：staging 未具備已合法設定、webhook 指向隔離 Preview 的獨立測試 OA，也沒有本人 LINE 參與。已請使用者提供可用測試門市／OA 名稱，不索取密鑰。未偽造 LINE webhook、略過 bot/profile 檢查或假稱綁定成功。
- 實體裝置、Safari／LIFF、全模組入口及上述視覺問題仍未完成。

原 PR #1465 保持開啟，尚不能宣告完整驗收成功；不合併正式站。
