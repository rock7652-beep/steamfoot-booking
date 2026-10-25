# 正式音樂／運動 LINE 一次設定盤點

使用者要求正式站所有音樂、運動店家納入。2026-10-26 對既有正式 Supabase project `qijlnhtpbintanzpxkvf` 執行 READ ONLY 查詢；未寫入正式資料、切換權限、啟用通知、修改部署變數、呼叫LINE外發或建立預約。

## 正式店家範圍與現況

以 COURSE、isDemo=false、未封存列出五店，保留現有TRIAL營運／方案狀態，不將其升級。療癒運動俱樂部（course）已封存，未納入本次開通範圍。

| 店家 | slug | 現行資格 | 公開 LINE 資料 | LINE 課程前日提醒 |
| --- | --- | --- | --- | --- |
| 買吉他 | myguitar | business.music | DB未填 | 尚無規則 |
| 銀百合音樂/舞蹈 | silverlily | business.fitness | DB官方ID @548jgryp，已有地址／地圖 | 規則已存在但未啟用 |
| YoungSky體重管理俱樂部 | youngsky | business.fitness | DB未填 | 已啟用 |
| IDO新莊館 | ido-xinzhuang | business.fitness | DB未填；既有文件記錄UFUN共用 @gve3723w，channel 2011889316 | 已啟用 |
| IDO板橋館 | ido-banqiao | business.fitness | DB未填；同上 | 已啟用 |

五店DB的Store.lineDestination與liffId均為空，但**不能因此判定部署中無設定**：共用OA本來就不能寫兩筆唯一destination。IDO兩店各有既有identity link，本次不改動。銀百合依實際資格保留運動模組，不依店名自行改成音樂。

Vercel唯讀變數清單回傳100筆並截斷110筆，未完整取得原STORE_LINE_CONFIG_JSON，無法從這份清單證明各店通道是否存在。沒有解密或覆蓋原JSON，沒有讀取任何token／secret值。新增舒生活JSON與已有金鑰保持不動。

## 已備妥的共用程式

- 總部 LINE 官方帳號清單包含所有未封存、非demo的COURSE店，即使尚未有部署設定也顯示「未設定」，保留既有蒸足與明確註冊店家。
- 已設定通道收到follow後，以該店名稱提示首次輸入預約／登記手機，由門市核對一次；已完成者沿用。依各店資料顯示聯絡電話、地址、Google導航，不使用其他店的預設資料。
- 共用OA只回覆一份門市選擇訊息，各門市入口為 `/member-connect?store=<slug>`，不依第一筆店家猜測歸屬；各店聯絡資訊獨立。
- 沿用現有簽章、phone claim、首次確認、既有會員及封鎖規則，不建立新身分、不覆蓋綁定、不宣稱僅輸入電話就完成登入或通知連結。
- 重新驗證按鈕至少44px；長店名可換行，狀態標籤保留完整顯示。

## 仍待完成

1. 核對各店的官方ID／好友連結；IDO共用帳號以既有文件為線索，仍需管理者確認現況。
2. 在控制台確認每個實體OA的Provider、Messaging channel、bot destination及LIFF／Login用途；金鑰由管理者直接存於受保護部署變數，不貼聊天。
3. 以可完整讀取的受授權控制台核對原JSON，採保留／追加設定，不覆蓋其他店。共用OA欄位與sharedAccountKey須一致。
4. bot info及Provider預檢通過後，明確核准發布，再由LINE Console Verify驗證Webhook及開啟使用。
5. 以指定顧客驗證加入／手機／門市確認及一筆實際提醒，才能將店家標為驗收完成；提醒規則尚未設定者另補，不在缺通道時先開外發。

本次已詢問使用者提供各店公開LINE識別，不要求金鑰。上述缺資料步驟未完成前，不將五店標成已開通。

## 驗證與限制

9檔／107項共用通道、簽章、歡迎訊息、門市隔離、健康檢查、原會員連結／登入測試通過。修改檔ESLint、diff檢查通過；最終TypeScript與CI結果另記PR。

Chromium隔離預覽390×844、768×1024、1024×768、1366×900通過：五店名稱可見、無整頁橫向溢出、按鈕至少44px、範例重新驗證狀態更新。訊息與狀態均為fixture，不代表真實LINE或正式通道驗證。證據位於 `evidence/20261026-course-line-setup/`；腳本 `scripts/qa/course-line-setup-browser.mjs`。

支線自動部署停用，只使用隔離fixture預覽。本文件不是正式發布或五店串接成功紀錄。
