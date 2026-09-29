# 音樂教室獨立驗收 — 2026-09-28
## 範圍
- 預覽部署：steamfoot-booking-5fm8735a1-rock7652-2111s-projects.vercel.app
- 預覽資料庫：steamfoot-preview (ttworfzgwejdeolegkxl)
- 店別：store-lubymusic；PR #1133 維持 Draft，正式站未合併。
- 驗收使用新建「驗收0928」資料；歷史課次與插班名單以 SQL 準備，出席狀態、請假、更正與付款由瀏覽器實際操作。
- SQL 準備歷史資料不代表已驗收插班建檔入口。

## 第一輪結果（後續修復見文末）
| 項目 | 結果 | 證據 |
|---|---|---|
| 插班進度顯示 | 通過 | 10/26 14:00，整班5/8、甲5/8、乙3/6、丙4/7；整頁重載後一致 |
| 課表內續報 | 通過 | 9/28 10:00學員繳費自動帶入人及課程；購買8堂後留在原名單，本期4/4、下期已繳8堂 |
| 付款與歷史 | 部分通過 | 本期3200、下期6400，付款日期/方式正確；9/7、9/14、9/21已出席；重載仍保留。下期尚未排課提示正確，有下期排程的顯示本輪未實測 |
| 個別課請假不扣堂 | 通過 | 原9/28日期保留；請假1、曠課0；原卡remaining=1，該預約DEBIT=0 |
| 單堂補課完整流程 | 未通過/受阻 | 單堂可建立；選學員優先帶入原期1堂，但沒有待補課次數及原請假關聯選擇；送出被「已達方案本月預約額度上限」拒絕，未改動額度或繞過限制 |
| 團班請假扣堂 | 通過 | 甲9/28請假後GROUP_LEAVE_FORFEITED、8→7，DEBIT一堂 |
| 團班更正與曠課 | 通過 | 恢復待點名7→8；再曠課8→7；請假0、曠課1，10/26重載保留 |
| 音樂詞彙隔離 | 未通過 | 顧客清單仍有「0點」及「直屬店長」 |

## 本輪修復
實際購買個別4堂時出現系統錯誤。Vercel runtime log確認舊CoursePurchase_transferLastFive_check不接受店長結帳使用的空legacy欄位。
已於preview套用course_checkout_transfer_compat：
- 舊轉帳流程仍要求4–5位數字。
- 已具listPrice及paymentMethod的店長結帳允許legacy欄位空字串。
- 原CoursePurchase_checkout_valid仍要求BANK_TRANSFER有4位transferLastFour。
- 重測OTHER結帳成功，僅一筆CONFIRMED訂單、4堂卡。
- SQL實測缺轉帳末碼及空legacy舊流程皆仍遭check constraint拒絕。
- 正式資料庫尚未套用。
- Supabase安全advisors既有INFO(封閉RLS無policy)及btree_gist位於public的WARN，未變更auth/RLS/grants。
  https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

## 留存測試資料
- 學員：驗收0928補課 (cmul2bd050001js0462incwe0)
- 本期購買：cmul2h4zv000bjs04804252xg；卡cmul2h4yw0009js04kei1mopo。
- 新增測試教室、團班、甲乙丙及四堂歷史：scripts/preview-music-acceptance-20260928.sql。
- 另透過UI續報驗收0928個別續報8堂。
- 9/29 10:00測試單堂已建立，但加入學員被額度拒絕，仍為空課。
- 甲9/28留在曠課測試狀態；個別課9/28留在請假測試狀態。
- 原15人驗收班及其他既有學員本輪未修改。
- 畫面證據：music-qa-insertion-0928.png。

## 第一輪待辦（已於第二輪處理）
1. 補齊學員補課關聯：待補次數、原請假日期、可取消補課選擇；目前僅最快到期卡預選。
2. 以有可用預約額度的隔離驗收店重測補課新增、出席、實際日期、只扣一次及下期排程顯示。
3. 移除音樂顧客清單的點數與直屬店長欄位；避免影響運動模組。
4. 完成上述再判斷發布；本報告不代表全項通過。

## 補課與音樂介面收尾（第二輪）
- 實作提交：遠端 `382ab1a46f36dc8f5964105f4334922e82898cd6`；本機 `a45dc372`，tree 相同。
- 新版預覽 READY：`https://steamfoot-booking-bdtrasgtq-rock7652-2111s-projects.vercel.app`。
- 補課表單會列出待補次數及原請假日期，優先選原堂數方案；可選「不安排補課」。
- 每筆補課保存原請假預約 ID；上課紀錄顯示原請假日期 → 實際補課日期及狀態。
- 新增前驗證門市、學員、原方案、課程、日期及原請假狀態；保留額度與權限檢查。
- 店別交易鎖及部分唯一索引防止重複補課；取消補課可重新安排；已有補課時禁止直接恢復原請假。
- 音樂顧客清單僅顯示堂數，隱藏直屬店長、批次指派；堂數排序使用 sessions。音樂顧客詳情保留推薦人編輯，不要求歸屬店長；運動模式維持原行為。
- 57 項相關單元／互動測試通過，TypeScript、變更檔案 ESLint、CI targeted tests 通過。
- 真實 preview PostgreSQL 檢查：重複補課、自己連結自己、不存在來源均遭約束拒絕；整個檢查交易 ROLLBACK，回查測試資料連結數為 0。
- 安全 advisors 與前次相同（138 個無 policy 的封閉 RLS INFO、既有 extension warning），未放寬權限或 RLS。
- 完整 Vitest baseline 仍有原本 13 個失敗／7 個檔案及 1 個 suite import 問題；比對前一提交 CI，失敗項目相同。本輪無新增 baseline 失敗。Cloudflare Workers build 亦在前一提交已失敗；此工作以 Vercel preview 為部署目標。
- 新版已安全登入並完成下述瀏覽器介面驗收；預覽店的寫入仍受月預約額度限制，完整寫入生命週期由隔離 PostgreSQL 驗收，兩者不混稱單一瀏覽器端到端通過。

### 上線前處理
1. 隔離 PostgreSQL 補課生命週期 4/4 通過，零跳過（GitHub job 108887520462）；涵蓋請假不扣堂、補課重試只建一筆、出席重試只扣一次、日期持久化、恢復出席返還堂數、取消重排、並行防重複、跨店與額度拒絕。測試不使用正式／預覽資料庫憑證。
2. 新版待補選擇、移除選擇及音樂顧客清單已由瀏覽器驗收；現有陸比預覽店月預約 370/100，未改方案或額度。
3. 整理既有 baseline／Cloudflare 失敗的發布處置，不能稱全 CI 綠燈。
4. 正式發布前需先套用兩個 migration：`20260928094955_course_checkout_transfer_compat.sql`、`20260928101128_course_student_makeup_link.sql`，再部署本版程式；本輪僅套用 preview。
5. 程式回退可保留 nullable 補課欄位與索引，不刪除已記錄的補課關聯。PR 維持 Draft；正式站未合併。

### 最終介面驗收與發布準備
- 程式提交 `c2d15450cafeb05807f6cbae3c8e41bc5e3d5719`（本機 `c6c66fa7`），tree `b6964e4f2c9a99f94ee746e370eb11fa85dd121b`。
- READY 預覽：https://steamfoot-booking-e2ws65oh2-rock7652-2111s-projects.vercel.app 。
- 固定預覽：https://steamfoot-booking-git-codex-musi-c58199-rock7652-2111s-projects.vercel.app/s/lubymusic/admin/dashboard/courses 。
- 實際驗收發現 member-booking 未傳音樂模式，已修正；9/29 10:00 選「驗收0928補課」可見待補課 1 堂，自動選中 2026-09-28 請假與原期剩餘 1 堂，可改為不安排補課再切回，確認預約按鈕可用。
- 顧客清單欄位為顧客、系統通知、可用堂數、最近上課、備註；篩選無直屬店長，排序為可用堂數；詳情無直屬店長。持有方案正確分列本期 1 堂與續報 8 堂。
- 最後修正再跑 13 項課表互動測試及 TypeScript，全部通過；最終提交 CI Typecheck、Changed-file ESLint、Targeted tests、music-makeup-postgres 通過，PostgreSQL job 108891063847。
- 完整 Vitest baseline 為既有 continue-on-error 工作，仍失敗；Cloudflare Workers 亦失敗，未停用或放寬 CI。Vercel 預覽部署成功。PR #1133 可合併但仍維持 Draft，未合併。
- 本輪「移除點數與直屬店長」完成範圍是音樂顧客清單、篩選與顧客詳情；全站其他頁面（首頁名下顧客／統計說明、未指派方案及分析角色）仍有直屬店長呈現，不宣稱全站移除。
- 上線順序：確認發布檢查處置 → 正式資料庫先套用兩份 migration → 部署核准提交 → 確認登入、課表、出席恢復及繳費。正式資料庫 migration 與正式部署本輪均未執行。
