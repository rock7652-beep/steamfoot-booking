# 會員區塊重複修正與 Preview 回歸

受測應用版本：`af1b53221ebeebf28e4242bdb612c73ba6aa2390`。

原專案 Preview：<https://steamfoot-booking-ohm38szky-rock7652-2111s-projects.vercel.app>（READY，非 production）。

## 原因與修正

`CustomerDetailDrawerContent` 的會員狀態及 LINE 管理是同層兄弟元件，原本都使用 `key={customer.id}`。React reconciliation 因重複 key 可能保留舊 DOM；來源只有一次掛載，畫面卻會出現多份，唯讀切換時甚至未刪除應消失的會員區塊。

改為 `member-connection:${customer.id}` 與 `line-management:${customer.id}`，保留換顧客時的身分隔離，同時讓兩個兄弟元件的 key 唯一。沒有以隱藏重複 DOM、刪除功能或修改權限規則掩蓋問題。

回歸測試涵蓋反覆重繪、可編輯／唯讀切換、A→B→A。修正前明確出現 duplicate key 警告並失敗；修正後通過：

- [修正前失敗紀錄](regression-before.log)
- [修正後 27 項相關測試通過](regression-after.log)
- TypeScript、變更檔 ESLint 通過。
- GitHub [CI run 40902528183](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/40902528183)：Changed-file ESLint、Targeted tests、Typecheck、Full Vitest baseline 全部 SUCCESS。

## 真實 Preview 驗證

使用正常 Vercel 登入、同專案短效 development OIDC、合成 QA Owner 一般帳密登入。實際執行：

1. 開啟 A，會員與 LINE 管理各一份。
2. 儲存合成備註並完成 server refresh，仍各一份。
3. 透過 compare-and-set 復原備註並再次 refresh，仍各一份。
4. 切到 B、展開取消確認，但不提交 LINE 寫入。
5. 桌機 1366／1920、iPad 1024／768、560px 窄容器、390／360 手機共七組尺寸，均各一份、無整頁或抽屜水平溢出，108×44 按鈕可達。
6. 返回 A，仍各一份。共 12 個區塊數量檢查通過，沒有 pageerror。

[瀏覽器原始結果](browser-results.json)、[桌機](desktop.png)、[iPad 尺寸](ipad.png)、[手機尺寸](mobile.png)。截圖為 viewport，避免將視窗外背景清單當成覆蓋目前控制區。

A 備註最終為 null，已還原；預約／方案／消費完整列摘要仍與初始相同，B 維持 LINKED。沒有送出 LINE 取消、重新綁定或通知。臨時 QA Owner 再次停用、移除密碼雜湊並刪除本機帳密檔；不儲存 token、cookie 或密碼。

## 未驗與限制

- 使用者確認沒有可用的獨立測試 OA；真實 LINE 捕捉、bot/profile 核對與重新綁定維持未驗，不借用其他門市、不偽造驗證。
- Chromium 視窗尺寸模擬不是實體裝置或 Safari／LIFF 驗收。
- 登入頁會請求 `/_next/static/immutable/...` 資源並收到 404；舊版亦觀察到相同問題。本次額外的「所有靜態請求健康」斷言因此失敗，原始結果完整保留，沒有刪掉斷言冒稱全部通過。12 個操作／區塊檢查與七組尺寸已完成，資源健康仍不是通過狀態。
- [Network initiator／frame 來源](resource-origins.json) 顯示 404 出現在 `/hq/login` 的主 frame；目前不足以斷定是平台輔助資源，故不將它直接歸咎於 Vercel 或聲稱無影響。未為通過測試而修改部署保護或加入任意靜態路徑 rewrite。

原 PR #1465 仍開啟、不合併；整體不標示完整驗收成功。
