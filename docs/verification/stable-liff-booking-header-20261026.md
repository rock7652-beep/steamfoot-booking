# LIFF 轉場頁首一致性修正（2026-10-26，Asia/Taipei）

使用者回報已發布的右上角店名在切換時，先顯示店名左／Logo 右，完成後才顛倒。原因是初始 LIFF Shell 保留舊排列，而 public-trial layout 額外放置另一份靠右 Logo；最終表單則是新排列。

修正初始 Shell 的載入及後續狀態，固定 Logo 左／店名右，Logo 與表單同為 80px。public-trial bridge 使用最終表單的共用品牌元件，layout 不再重複加入靠右 Logo。門市切換選單向右對齊，限制寬度避免窄螢幕溢出。登入、LINE 驗證、一次性 entry、預約交易、通道與環境設定均未修改。

這是 PR #1433 已獲使用者發布授權的「右上角店名」變更之轉場缺漏修正，延續該授權完成正式修復。

驗證：

- 4 個既有入口／驗證／導覽測試檔 23 項通過。
- TypeScript 通過；ESLint 零錯誤，LiffShell 原有 `hasWorkAccess` 未使用警告保留；diff check 通過。
- `scripts/qa/stable-liff-header-browser.mjs`：實際元件、隔離假 SDK、封鎖伺服器與外部連線。390／768／1366，短／長店名，入口載入、驗證中、錯誤、表單共 24 組。
- 每組僅一個 Logo，均在店名左側、無水平溢出；手機各階段 Logo 的水平位置相同。桌機保留原本會員 Shell 與表單的可用寬度，驗證排列一致，未宣稱桌機所有座標完全相同。
- 證據位於 `evidence/20261026-stable-liff-header/`。這是隔離 Preview，不代表真人 LINE 登入流程驗收。
