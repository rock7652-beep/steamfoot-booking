# PR #1205：進銷存與三層角色驗收

日期：2026-10-05。狀態：Preview 已部署，正式站未合併、未遷移、未重設既有人員。

## 完成範圍

- Owner 全店權限；Admin 保持獨立總部角色，Owner 仍受所屬店、模組與訂閱限制。
- Manager 預設營運及人員管理；只能調整 Staff / 舊 Partner，不得授予超過自身的權限或自行升權。
- Staff 預設日常服務、銷貨、收款、收貨；成本、進貨付款、商品價格管理預設關閉。
- 三種角色預設與個別授權並存。角色修改顯示差異並要求儲存確認；未指定套用預設時保留個別授權。
- 最後一位有效 Owner 的降權與停用由交易及 Store 行鎖保護；權限異動有稽核並使會話快取失效。
- 建店流程保留真正 Manager / Staff，不再將 Manager 提升為 Owner。
- 收付款分離、成本及匯出保護、顧客選取與身份價格相關既有進銷存修改一併保留。

## 已完成驗證

- 18 個測試檔、194 項測試通過，涵蓋角色預設、越權授權、自我調權、跨店、最後 Owner、課程及 SPA 相容性、建店實際角色、進銷存財務及匯出。
- TypeScript 通過；修改檔案 ESLint 0 errors（system-status 既有兩項 unused-variable warnings）。
- 應用程式版本 e748f70d 的 Vercel Preview 建置及部署 READY，deployment dpl_8Dggr7qu3PNMWP1BvqHMC8JuPnWe。
- 使用既有 Staging Admin 登入測試：新增預設 Staff；Owner / Manager / Staff 選項；角色預設差異；原生儲存確認取消後原帳號不變。
- 實際資料的 Staff 編輯頁顯示「角色預設」，成本、付款、庫存管理及價格管理皆關閉，收貨及銷貨開啟。
- 角色欄位：手機內容寬 375px（390px 預覽含捲軸）、iPad 直向 768px、橫向內容寬 1009px（1024px 預覽含捲軸）、桌機 1440px，scrollWidth 等於 clientWidth；選單高度 44px，手機字級 16px、其餘 14px。
- Preview 的既有銷貨資料及既有人員角色未因介面驗收被修改。

## 測試資料及限制

隔離 Preview 已套用角色 enum migration；正式資料庫未套用。建立 QA1005 店長權限驗收及 QA1005 門市權限驗收兩筆停用、無密碼、無登入能力的固定測試資料，分別含 43 與 22 項預設授權；不占啟用人員名額，不可用來宣稱真人登入驗收通過。

## 上線前尚待完成

1. 使用可登入的 Owner / Manager / Staff 測試帳號，實測完整銷貨、收款、收貨、付款、成本及匯出；對 Manager 調整 Staff 後，驗證 Staff 既有登入立即生效。
2. 確認正式店現有人員對應角色及個別權限；不得用姓名或歷史 isOwner 欄位自動批次改角色。
3. 上线前安排正式 enum migration，檢查資料備份及回復方式；進銷存與權限一起發佈。尚未執行正式 migration。
4. 保持 PR Draft；在上述驗收完成及正式發佈獲授權之前，不合併、不部署正式站。
