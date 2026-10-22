# 美業期間消耗統計、共用提醒中心與音樂回歸

## 範圍與來源

沿用 `preview/beauty-ui-alignment-20261021`，起點 `c0edd8ab`（前版應用 `d7580cce`）。只更新隔離 Preview，資料庫為 `steamfoot-preview`。不新增 migration、角色、權限 SQL，不改 LINE 開關、排程、正式站或既有業務資料。

- 期間消耗統計：原 `growth/consumption` 頁面、篩選視窗、排序／分頁、DataTable、CSV；美業只增加資料來源及名稱／顧客目的地插槽。
- 音樂使用既有 COURSE 模組及 `business.music` 授權，不新增 MUSIC 模組。與運動共用同一統計頁及 CourseBooking / CoursePointCard / CoursePurchase / CoursePurchaseRefund 口徑。原顧客經營導覽已對 COURSE 提供入口，本次增加音樂堂數／共用／退款及 CSV 回歸驗證。
- 提醒中心：`src/components/admin/reminder-center.tsx` 由原運動提醒頁抽出，運動／音樂原頁與美業共同使用；分頁、設定列、通知人員清單、發送紀錄均使用原元件。美業從設定開同一個 SettingsPanel，保留關閉、分類與紀錄查詢。

## 美業統計口徑

1. 身分、店家、顧客可見範圍、店長指派由 core connection 先確認；美業查詢只接收授權後的顧客資料，Beauty 專用角色不需新增 User / Staff 表權限。資料讀取維持 beautyPrisma，無通用帳本寫入或跨店接點。
2. 每個實際扣次分項計 1 次；預約保留額度 delta=0 不算消耗。確認目前 debit 並核對 RESERVE / CORRECTION 淨帳本；恢復後不算。包含取消／未到時仍只計實際扣次，亦可排除兩者。
3. 單次已完成且有淨收款才算消耗；取消／未到單次依實際扣除選擇。未來已標記完成的測試預約不提前列入。
4. 使用歸實際服務 customerId；購方案款及退款歸持卡購買人。匿名同行者不靠姓名或聯絡人歸戶；已撤除共用成員不顯示該卡可用餘額。
5. 消耗金額沿用共用頁的服務收款概念，方案扣次不換算金額；實付依支付日期淨額，排除技師 FEE / FEE_VOID。兩欄不可相加。退款跨期按退款日期顯示，可為負。
6. 剩餘額度為查詢當下，不是期末快照，也未扣預約占用；共用卡餘額不跨顧客加總。關卡或到期不顯示可用餘額。
7. CSV 與頁面沿用相同查詢、篩選、店家、權限及匯出上限；Beauty 使用「取消／未到扣次」文字。低權限、跨店方案或功能關閉在資料讀取前拒絕。

## 提醒中心的實際邊界

- 程式已有：服務成立、改期、取消、完成等 BeautyEvent 及前一天 18:00 提醒；本次共用紀錄 UI 讀取這些服務事件與本店 ManagerNotificationLog，排除 AUDIT。原事件保留，沒有重送、補送、改狀態、遷移綁定或建立通知人員。
- 開頁完全唯讀；店長綁定名單只顯示本店資料，不出現可啟用其他模組通知的設定。錯誤原因可帶同店 MessageLog 的已存原因。分頁、對象、日期、狀態、類型與姓名搜尋沿用原中心。
- 尚未接入：美業店長服務通知發送、方案剩餘／到期發送、體驗後自動關懷排程；顯示待接入，沒有拿課程排程／教練身份／課程方案冒充美業。
- LINE 仍關閉。SKIPPED / PENDING 不等於送達；本輪不宣稱正式啟用或真實 LINE 驗收。

## 驗證與限制

- 8 個測試檔 84 項：共用原統計、Beauty 專用連線及 SQL、音樂堂數／共用／退款／CSV、提醒權限／店家／AUDIT 排除／搜尋／分頁、原課程提醒回歸。
- 80 個合成瀏覽器案例：真實共用元件，運動／音樂／美業；1366、1920、1024、768、560px，加 390px 提醒清單／日誌與目的地、唯讀控制及篩選視窗。封鎖後端與外部網路，不能視為登入後業務或實機驗收。
- 本機 production Turbopack build、TypeScript、相關 ESLint 通過。建置使用虛擬 loopback 連線，未執行 migration。
- Preview 音樂店 `store-lubymusic` 唯讀跑相同 COURSE SQL：2026-10-01～22 共 85 位可列顧客，消耗與實收皆 0；此證據只確認現有資料查詢可執行，正數扣堂／退款由隔離 PostgreSQL fixture 測試涵蓋，不能當作音樂真實登入或正式啟用證據。
- Hosted 應用版本 `947ea7e79b1111947cec723e0ab2ccc6963651e1`，部署 `dpl_BwZC8VkoM6F4FwFRwVJkAZFZkEUh` READY、target=null（Preview）。實際網址 https://steamfoot-booking-5yjexkiu7-rock7652-2111s-projects.vercel.app 。
- 9 項真實登入檢查通過：店長原顧客經營入口、CSV／畫面顧客列一致、篩選視窗、跨店方案頁面及 CSV 拒絕、原設定面板、分頁及篩選仍在面板、唯讀綁定與 Escape 回原分類、顧客及技師拒絕後台 CSV／提醒。
- Hosted 1366×900、1024×768、768×1024、390×844：統計與提醒紀錄均無整頁水平溢出。這是 Chromium 模擬尺寸，非實體裝置。
- 當前美業列出 7 位顧客，實付合計 15000。服務消耗合計 0：目前唯一已到服務日期的 COMPLETED 單次服務沒有收款，也沒有卡片；其他服務日期在未來。因此不能用「已完成服務 1」當成「有扣次／淨收款消耗 1」。首次自動驗收誤以完成數 1 為預期，唯讀核對後修正驗收預期，未更改應用計算或資料。
- 驗證後唯讀核對：15 筆預約、10 筆付款、所有付款種類合計 15500、SALE/REFUND 淨額 15000，兩張卡 remaining=2/5、共用成員與未關卡狀態皆維持；BeautySetting.notifications=false；舊只讀 QA Staff INACTIVE / User SUSPENDED。沒有本輪服務、收款、扣次、綁定或角色寫入。
- 音樂 Hosted 真實登入仍未驗；已確認原入口、同套資料查詢、正數扣堂／共用／退款／CSV 的隔離測試，不冒稱音樂店家已簽收或正式已啟用。
- 實體裝置、店家簽收仍待完成。正式站與 LINE 均未操作。

證據：`docs/beauty/evidence/consumption-reminders-20261022/`。

本版部署近 15 分鐘的 Vercel Preview error / warning 查詢未找到符合紀錄；此為有界觀測，不能取代後續店家使用驗收。此次 hosted access 綁定本版確切 origin，未修改部署保護、未重用舊 host 的存取連結。驗收文件與證據另存本機 docs commit，避免僅為補證據再觸發部署。

重要下一步：補音樂店真實登入驗收，接著逐項補美業店長通知、方案剩餘／到期與體驗後關懷的獨立資料接點及關閉狀態驗證；LINE 實送、實體裝置與店家簽收另列待完成，正式套用仍需另外授權。
