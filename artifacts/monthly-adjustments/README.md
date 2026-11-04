# 獎勵與調整：本機驗收

基準版本：83af0b68（PR #1504）；工作分支：codex/monthly-staff-adjustments。
最新需求：本次對話；自訂必填事由、加項／減項、正數金額、日期及歸屬月份，不設明細狀態，只提供編輯／刪除。

## 行為

- 蒸足／美業技師與運動／音樂課程人員共用調整表單、統一明細、搜尋、加減合計。
- 課程調整併入月結 fingerprint 與確認快照，保留原授課費／利潤口徑。本人已確認收入會包含調整；重新開啟時仍保留上次快照並提示調整中。
- 美業沿用獨立技師 ID 與原拆帳計算，調整併入美業月結 fingerprint 與快照；重新開啟後即使金額未變，也使用新的確認請求識別，避免防重送誤擋再次結算。
- 蒸足服務收入與租金保留原分列規則，另列加項、減項及調整後合計。新鎖定機制保護調整明細；不改寫原服務交易或租金。
- 已結算月份須重新開啟才能新增、編輯、刪除或移出／移入；課程／美業完成使用原有「確認月結」。
- 後端每次核對權限、門市、功能、Staff 的 Owner／Manager／Staff 階層及教師財務範圍，鎖定 Store；版本比對、防重送、軟刪除與 AuditLog 同交易完成。修改會更新原／新月份版本。
- 美業表格為選用安裝：核心 migration 不依賴未安裝的美業表；已安裝時建立技師同店複合外鍵，寫入仍逐次驗證技師所屬店家與有效狀態。
- 不自動匯款、不自動新增收付款、不自動發通知，也不自動將負數差額帶到下月。

## 驗證結果

- 24 組相關 Vitest，277 項全部通過，含 PGlite 執行真實 migration 與 action SQL 的新增／重送／修改／移月／刪除／結算重開／衝突／跨店／權限／稽核失敗回滾。
- `tsc --noEmit` 通過（Node heap 8 GB；預設 4 GB 曾不足）。
- 變更檔 ESLint、Prisma schema validate、`git diff --check` 通過。Prisma validate 使用虛構 localhost URL，只驗結構，不連資料庫。
- Chromium 隔離元件預覽：25 人、30 筆起始資料、長事由；1366×900、1180×820、820×1180、390×844。全部可新增，整頁無橫向溢出；表格於區塊內捲動。
- 瀏覽器操作：搜尋、加項改減項、刪除確認、鎖定／重新開啟、唯讀、失敗保留草稿；無 pageerror。
- 截圖為瀏覽器模擬尺寸，非 iPad 真機。fixture 與 actions 的資料庫測試分開，不能當作登入後完整業務驗收；無前後效能基準。

## 重現預覽

```sh
npx vite --config scripts/qa/monthly-adjustments/vite.config.mts
node scripts/qa/monthly-adjustments/verify.mjs
```

fixture 只使用合成人員及記憶體資料，替換 server actions 和 next router，不讀資料庫、不發通知。可用 `PLAYWRIGHT_MODULE` 與 `CHROMIUM_PATH` 指定環境工具。

## 發布界線

尚未 push、建立 PR、部署、套用正式 migration 或修改正式資料。需要先在授權隔離環境完成登入後端到端驗收，再經明確授權發布；不能把這份本機證據視為正式站已可用。

## 完整流程界線

使用者故事：營運月結 → 新增／編輯／刪除調整 → Server Action → 同店人員及月份權限／交易 → 明細及月結總額更新。

| 接點 | 證據 | 結果 |
| --- | --- | --- |
| 畫面及回應呈現 | Chromium 四種尺寸、零 pageerror、失敗保留草稿 | 隔離元件通過 |
| 真實 Server Action → SQL → 回應 | PGlite 實際 migration、action、交易與 AuditLog | 隔離資料庫通過 |
| 模組月結計算與快照 | 蒸足／課程／美業相關回歸測試 | 通過 |
| 登入瀏覽器 → 真實 Server Action | 預覽替換 action；環境無可用正式連線與驗收帳號 | 未驗，不宣稱完整業務驗收 |
| 正式部署及正式資料 | 本次未執行 | 尚未上線 |

Migration SHA-256：`d67a36fcf6c78744b1a6d88bf811e29efff7376d065767266768ffa39e8ee27f`。
