# 全站操作一致性盤點與分批實作計畫

2026-10-12，Asia/Taipei。盤點及最小實作順序經使用者確認後，B1已完成程式、合成驗證、遠端CI與隔離Preview；已登入驗收仍待安全登入管道，保持Draft。中央會員及工單通知功能另案；其既有入口列入覆蓋清單，但不在本案實作。沒有修改真實顧客資料、資料庫或安全設定，沒有正式發布。

最新 B1 紀錄：`docs/course-settings-three-state-b1-20261012.md`。產品提交 `830f2418d311670c513ad21f4a2e52fa6744acef`；支線 `fix/course-settings-three-state-20261012`；base main `695df9e22c2e5cba66f061b78a55df37e884b89d`。H01–H03 已在本機補齊，保留待隔離 Preview／登入後驗收，不能算成已發布成果。下方現況表保留盤點時缺口證據，依本段及批次紀錄接續。

## 查核基線與規範

- 遠端 main：`695df9e22c2e5cba66f061b78a55df37e884b89d`，GitHub commit API 核對。相較本機 `f3ef9868eb09fc5a3b2bc71acad89034c9176f1c` 僅新增 #1309，compare 為 ahead 1 / behind 0。Git fetch 因 proxy:8080 無法連線失敗，未偽稱本機已更新到遠端 main。
- 在遠端 SHA 重新讀取 `AGENTS.md`、`docs/STEAMFOOT_UI_Settings_Framework.md`、`docs/ui-operation-consistency-20261011.md`、課程 `settings-workspace.tsx` 及 `shared-hub.tsx`。課程三入口缺口仍存在。
- 其餘原始碼以本機 f3ef9868 查核，遠端 compare 沒有改動的檔案適用相同證據；#1309 改動部分以該 commit diff 查核，互動仍待驗證。
- 規範：Framework 第 7–11、14、16、18、21–22、26–29、32–34、40–42 節；`docs/panel-loading-inventory.md`、`docs/performance/cache-first-loading-audit.md`、`docs/role-permission-matrix.md`、`docs/date-time-rules.md`。舊文件的「尚未發布」文字不覆蓋最新 merged 狀態。
- 狀態「已完成」只表示已合併基準或已存在的程式機制，不表示所有裝置或整條業務已通過。「待補」需有明確程式證據；「待驗證」不得算成缺陷或新成果。P0 第一批；P1 已核實操作缺口；P2 補驗後決定；P3 低頻或另案。

## 已完成回歸基準

| PR | 合併 SHA | 本案只回歸的範圍 | 限制 |
| --- | --- | --- | --- |
| #1299 | 356deb28714c680ac0538e2b4249ad5f86f412d9 | 課程名單處理回饋；蒸足／SPA 三態；設定返回位置；排序復原；母子店切換 | 保留原裝置及業務驗收限制，不重算新成果 |
| #1306 | 9e6237163d2469874a14f904ad385aad3b68f70e | 交易備註、提醒開關回饋 | 通知／權限確認不能因樂觀顯示而略過 |
| #1308 | 3677bf3d1dc20dd474acdc311672104865b7fff2 | 蒸足／SPA 顧客備註 pending-preview、草稿、CAS、復原 | 既有 Chromium 尺寸結果不等於真實 Safari |
| #1312 | f3ef9868eb09fc5a3b2bc71acad89034c9176f1c | SPA 顧客抽屜隨頁首高度定位 | 已 merged；PR body 舊「阻擋合併」段落不當成重新開案依據 |

另有最新 #1309（695df9e2）教師自行請假／整堂調課、個別權限 JSON receipt 及固定保存回饋，視為既有機制，不在本案重做。

## 開啟 PR 與避重範圍

GitHub open PR 搜尋返回三件；已再讀 metadata 與完整 changed filenames。實作前須重查，PR 描述中的舊 head 不代替 metadata 最新 head。

| PR | 支線及最新 head | 相依與避重 |
| --- | --- | --- |
| #1310 | feat/customer-unified-detail-20261012；cfef9f04a59d85338c7fe7856502508358dbb5c9 | 顧客詳情、紀錄／摘要／進階 readers、顧客表單、備註共用編輯器、預約個人結帳／詳情；本案不另外開同需求 PR，整合後回歸 |
| #1307 | docs/operation-guide-audit-20261012；9335cd4e0e77fc683b838cd0228fe971bca48556 | 操作指南、搜尋詞與指南盤點；本案只寫本盤點文件，不改指南資料 |
| #1245 | feat/music-opening-state-20261007；5be0b6d53202e6187d17747700f8cd3e5c493093 | 音樂期初權益、名單、顧客／會員課程、卡片、提醒與服務層；不改期初堂序、權益、計薪、補課或其 Preview／DDL |

三態的 settings-workspace/shared-hub 不在以上 PR changed filenames 中。舊 #1299 文件提及的 #1296 不能當成仍開啟的阻擋；施工前以最新 open 清單為準。

## 七類共用驗收案例

每筆盤點與路由附件均引用以下案例；不適用必須在驗收時記錄原因，不能自動當通過。

| 代碼 | 檢查範圍與驗收 |
| --- | --- |
| A1 | 已載入姓名、電話、狀態、類別立即篩選；中文輸入組字、清空、混合篩選、無結果；分頁結果標示範圍，不能把當頁結果當全店；跨店不使用舊索引 |
| A2 | 備註／資料／已讀／一般開關／上下架／排序：點擊立即顯示 preview 或處理中；成功才宣告儲存；明確拒絕回復；結果不明先核對再重試；同 tick 連點、晚回應、CAS、卸載、取消、草稿與局部更新；通知／權限保留權威確認 |
| A3 | 預約／取消／改期／到店／點名／收付款立即處理中，同筆鎖；後端確認才更新關鍵結果；拒絕、逾時、結果未知不重複交易；扣堂、退款、名額、教師／位置衝突保持原規則 |
| A4 | 首開、重開、背景更新、intent/open 去重、TTL、mutation 失效、A→B→A 舊回應、登出換帳號及跨店；金額／餘堂／名額與授權不以 stale 資料放行 |
| A5 | 同一動作以 client trace 與後端 timing 對照；區分 intent prefetch、正常確認讀取及真正重複请求；識別有依賴與無依賴串行，慢讀可分段且編輯須等完整權威資料；不得拿靜態 await 數量宣稱秒數改善 |
| A6 | 蒸足／SPA／運動／音樂 × HQ 真正視角／HQ 切店／OWNER／MANAGER／STAFF／PARTNER／唯讀；Hidden 無入口與 editor，Locked 可見未開通且不可操作，Enabled 仍檢查目的頁權限；撤回、到期、直連 query／panel 不繞過 |
| A7 | 桌機 1366/1440、1024×768、768×1024、767、560 窄容器；前台 360/390；標題／關閉、焦點／Escape／鍵盤、草稿、返回 query/hash/scroll、取消與重複操作；真實 iPad/Safari 另驗 |

## 已核實項目與模組清單

路徑簡寫 D=`src/app/(dashboard)/dashboard`，C=`src/components`，L=`src/lib`。實際路由與所有 190 個 page 檔案另見附件 `ui-operation-consistency-routes-20261012.csv`，每頁列齊 A1–A7，共 1,330 筆查核列。路由群組已去除；動態參數保留。附件只提供 page 與 import 定位證據，低頻頁面尚未逐條驗證實際操作與全部 transitive consumers，不能宣稱全站互動盤點已驗完。下表是可用來決定實作的原始碼證據，附件是全站查核範圍，兩者不可混算。

| ID／模組 | 實際頁面或入口 | 檔案與現況證據 | 狀態／優先 | 相依 | 驗收 |
| --- | --- | --- | --- | --- | --- |
| H01 運動／音樂 | /dashboard/courses?view=settings，通知分類→提醒管理 | D/courses/settings-workspace.tsx:215 用 canReminders &&；shared-hub.tsx 將 lineReminder entitlement 與 business_hours.manage、readOnly 合成布林 | 待補 P0：失去 Locked 呈現 | FeatureEntry；目的頁 reminders 授權 | A6：LINE_REMINDER 三態與角色、直連 panel=reminders；A7 |
| H02 運動／音樂 | 同設定→推薦分享 | settings-workspace.tsx:217 canReferralShare &&；shared-hub canPayment && !readOnly && referralShare | 待補 P0 | plans.edit 與目的頁檢查須核對；不放寬權限 | A6：REFERRAL_SHARE 三態、panel=referral；A7 |
| H03 運動／音樂 | 同設定→數位管家 | settings-workspace.tsx:218 canDigitalButler &&；shared-hub 同型布林；空狀態也以布林組合 | 待補 P0 | DIGITAL_BUTLER；panel=butler；空狀態 | A6：三態與無入口時空狀態，Locked 不掛 editor；A7 |
| H04 蒸足／SPA | /dashboard/settings 三入口及管家名單 | D/settings/page.tsx:160–182 已包 FeatureEntry；C/feature-presentation.tsx Hidden=null、Locked=未開通，children 不掛載 | 已完成回歸 P0 | #1299；C/dashboard-layout provider | A6、A4、A7，不重算成果 |
| F01 SPA | /dashboard/customers 姓名／電話 | D/customers/_components/spa-customer-list.tsx:32–43 等250ms router.replace；52–60 visible 只套來店狀態、不用 query | 待補 P1：已載入資料未立即文字篩選 | server 搜尋保留；有分頁／label 範圍須標示 | A1、A4、A7；慢查詢前已載入列先收斂，清空恢復正確 |
| F02 蒸足／課程 | 顧客清單／指派、預約選顧客 | C/customer-instant-search.tsx 本地 matchCustomerSearch＋不完整索引 remote；abort、requestKey、scope 守衛；D/courses/customer-list.tsx 用 customerPage 分頁資料 | 機制已存在；清單各篩選待驗證 P2 | #1310；customer search API 權限 | A1：不能把搜尋候選機制當所有清單通過；A4 |
| F03 四模組 | 潛客名單 /dashboard/digital-butler/leads | D/digital-butler/leads/lead-list.tsx:117 filter 導路由，selectedStatus 控制 select；不能僅憑路由判定缺陷 | 待驗證 P2 | 確認當頁已載入欄位及 server paging | A1、A2、A4 |
| F04 四模組 | 現金帳、交易、提醒紀錄、稽核搜尋 | D/cashbook/_components/cashbook-record-filters.tsx；reminders/notification-log-list.tsx；operation-audits/operation-audit-filters.tsx keyword400ms | 待驗證 P2；日期／全量查詢可保留 server | 稽核範圍及金融權限 | A1、A4、A5；只對已載入字段即時收斂 |
| W01 蒸足／SPA | 顧客抽屜備註 | C/operations/retained-note-editor.tsx；D/bookings/booking-service-note-editor.tsx；customers/_components/spa-customer-overview.tsx | 已完成回歸 P1 | #1308；#1310 會改同元件 | A2、A4、A7 |
| W02 四模組 | 交易備註、提醒設定 | 既有 retained note 及提醒儲存回饋；#1306 合併證據 | 已完成回歸 P1 | #1306；通知確認 | A2，不改通知送出或排程 |
| W03 蒸足／SPA | /dashboard/plans 上下架、顧客上架 | D/plans/plan-active-toggle.tsx、plan-publish-toggle.tsx useResponsiveAction apply/rollback/confirmed；onChange 局部確認，無 callback 才 refresh | 機制已存在；入口 callback 覆蓋及觸控待驗證 P2 | L/save outcome、父管理器 | A2、A7：compact 控制尺寸需实測，不據 class 直接判定 |
| W04 課程 | 課程狀態、設定資料、候補／一般開關 | C/admin/course-status-button.tsx；use-settings-save.ts；use-confirmed-settings-rows.ts；D/courses/settings-workspace.tsx | 機制已存在；全入口待驗證 P2 | 各 save revision／權威 receipts | A2、A4：新 props 不覆蓋較新確認 |
| W05 四模組 | /dashboard/staff 啟停／角色權限 | staff-status-toggle.tsx useTransition、處理中、成功才 toast/refresh；屬權限影響操作，不列必須樂觀切值 | 待驗證 P2：同 tick 防重與局部更新評估 | 後端階層與最後 Owner 守門 | A2、A3、A6；拒絕不可顯示成功 |
| W06 四模組 | bell、待辦、已讀 | C/admin/course-store-notice-bell.tsx；D/store-todo-list.tsx；server/actions/todo-dismiss.ts | 待驗證 P2 | #1296 已有課程門市通知；工單通知另案 | A2、A4：批次已讀失敗、未知、跨店 |
| T01 運動／音樂 | 名單逐人點名／教師出勤／批次 | D/courses/roster.tsx；src/__tests__/course-roster-operation-feedback.test.ts | 已完成回歸 P1 | #1299；#1245 音樂特殊權益 | A3：運動共卡序列化、音樂逐人獨立；備註不被回應覆蓋 |
| T02 蒸足 | 預約→到店／取消／改期／個人結帳 | D/bookings/booking-detail-drawer.tsx、attendance-modal.tsx、booking-participant-checkout.tsx；L hooks responsive action | 待驗證 P1；不另開 #1310 同需求 | #1310 優先整合 | A3、A4、A7，金融結果 server 確認 |
| T03 SPA | /dashboard/spa-schedule、芳療師工作 | D/spa-schedule/workspace.tsx；spa-staff/workspace.tsx；server/actions/spa-operations.ts | 待驗證 P1 | SPA 位置／芳療師／服務時間與收退款 | A3、A4、A7；不硬套課程名額模型 |
| T04 課程 | 排課／改期／租借／候補／購課及收款 | D/courses/workspace.tsx、rental-panel.tsx、purchase-review.tsx；server/services/course-booking.ts | 待驗證 P1 | #1245；固定期與點數／堂數分流 | A3：名額、老師、教室、扣點與預留；A4 |
| T05 教師／教練 | 我的工作→自己請假／整堂調課；教師管理權限 | 遠端 #1309 diff：course-teacher-session-dialog、course-work-permission-client、api/course/settings/work-permission | 既有機制，互動待驗證 P2 | 不重做 #1309；權限開關保留 server 確認 | A2、A3、A4、A7；版本不符與未知結果鎖定 |
| T06 四模組 | 收付款／退款／現金抽屜／進銷存 | D/transactions、payments、cashbook、cash-drawer、inventory/settlement-form.tsx | 待驗證 P1；無已證實可施工缺口 | 權威金額與金融保護，不加金融 stale 快取 | A3、A4、A5、A7 |
| R01 共用 | 顧客／預約／成長／現金小面板 | L/client-read-cache.ts；C/operations/panel-read-cache.tsx；D/bookings/booking-month-cache.ts | 核心機制已存在；consumer 全覆蓋待驗證 P2 | panel-loading-inventory；#1310 reader 重整 | A4：去重、TTL0 金額、失效中晚回應、換帳號店家 |
| R02 共用 | 路由設定、班表、低頻選项 | L/query-cache.ts、duty-cache.ts、cache-tags.ts、revalidation.ts；cache-inventory.ts 是歷史拓撲，queryCount 不算現時量測 | 待驗證 P2 | 權限撤回立即失效；#1309 route revalidation | A4、A5；逐一核對 writer 與 tag |
| R03 共用 | 母子店切換 | #1299 已移除同授權解析的第二次遍歷並封鎖舊 portal | 已完成回歸 P1 | 不另建授權快取 | A4、A6、A7；不承諾零等待 |
| P01 課程設定 | CourseSharedHub 首載 | shared-hub.tsx 已有兩組 Promise.all，但 waitlistSetting、music、setup及 JSX 內數個權限 await 仍有串行；不能僅以語法判定可平行或重複 DB | 待驗證 P2：有串行候選，無實測重複請求／改善秒數 | setup 與授權依賴、既有 request cache | A5：取得 trace 後才做獨立並行，別重寫架構 |
| P02 四模組 | 報表／分析、稽核、匯出 | L/cache-inventory.ts；D/reports、advanced-reports、analytics、reconciliation、data-export | 待驗證 P2 | session／員工及成本範圍 | A1、A4、A5；分段顯示與全量匯出範圍明確 |
| U01 SPA | 顧客抽屜標題／關閉 | #1312 header ResizeObserver／CSS offset | 已完成回歸 P1 | 不擴大其他抽屜定位、不重開發布 | A7：載入與完成狀態、頁首換行、草稿焦點 |
| U02 共用／課程 | 所有 drawer、設定 panel、返回 | C/admin/right-sheet.tsx；C/settings/settings-navigation.tsx；C/operations/operation-scope.tsx；L/operation-state.ts；課程 select 用 history.replaceState，分類 keepMounted | 既有機制；課程分類 Back/Forward 是否需補齊待驗證 P2 | #1299 蒸足／SPA 返回完成；各 modal dirty/busy | A7：不能把 replaceState 直接視為已支援分類历史 |
| U03 前台／LIFF／官網 | 預約、購課、會員、工作、登入、方案與試用 | src/app/(customer)、(liff)、(auth)、pricing、experience；詳見路由附件 | 待驗證 P2/P3 | 中央會員與工單通知另案，前台不新增指南 | A1–A7 適用項；手機鍵盤、返回、付款重送 |
| U04 HQ | 店家、功能、訂閱、試用申請／稽核 | src/app/hq/dashboard；D/operation-audits、system-status | 待驗證 P2 | HQ 真正視角與切店不同；安全設定另確認 | A2、A4、A6、A7；撤回後直連拒絕 |

## 最小實作順序

僅 B1、B2 已有可施工缺口。其餘先驗證，確認有問題才新增一次修補；共用需求在一個 PR 完成，模組接入和測試不另拆重複 PR。

| 批次 | 最小修改範圍 | 依賴與完成條件 | 支線規劃 |
| --- | --- | --- | --- |
| B1 P0 | H01–H03 同一批：沿用 FeatureEntry；拆開 entitlement 呈現與角色可操作；修正空狀態。shared-hub 只改必要 props／讀取，目的頁授權保持 | 先核對最新 provider states；運動／音樂 × 三態 × HQ／店家／唯讀；Hidden/Locked editor 不掛載；直連 panel 不寫入；蒸足／SPA #1299 回歸 | fix/course-settings-three-state-20261012（尚未建立） |
| B2 P1 | F01 SPA 已載入姓名／電話本地篩選，保留遠端搜尋、組字與路由結果；如果其他列表核實相同缺口，依同需求收斂，避免全站廣泛重構 | B1 獨立；清楚區分當頁與全店，回應對應目前 query／store；慢回應、清空、中文、返回與篩選組合 | fix/loaded-list-instant-filter-20261012（尚未建立） |
| V3 P1 | T02–T06 核對處理中、同 tick 防重、拒絕／未知、局部結果；現有 #1310 接手區域只回歸 | #1310/#1245 範圍先重查；若交易未知不能證明安全重試，先保留鎖與權威核對；不改交易規則 | 尚無修補支線；核實後按同一操作族一批 |
| V4 P2 | R01–R02、P01–P02 consumer／tag／trace 檢查。只修有證據的重複讀或無依賴等待 | 確認 client+server trace；不延長金融／名額快取、不加新架構；前後對照分段時序 | 尚無修補支線；首選 course hub 小批 |
| V5 P2 | W03–W06、U02–U04 低風險資料及全站抽屜／返回補驗，已完成基準只回歸 | 同需求共用元件及所有 consumer 一個 PR；未知結果、權限、表單草稿需保留；真機限制列明 | 核實缺口後才建立 |
| V6 補驗 | 真實 iPad/Safari、延期390px，依附件與本次受影響入口補驗 | 維持獨立待補紀錄；不可當成重開已結案發布或全站通過前提 | 不預先建立產品 PR |

## 每批接續紀錄

| 批次 | 實際支線／PR／最新 SHA | 修改範圍 | 測試通過／失敗／未做 | 阻擋與下一步 |
| --- | --- | --- | --- | --- |
| 盤點 | 本機 f3ef9868；遠端 main695df9e2；無新PR／實作提交 | 本文件、路由CSV；remote main差異與open PR清單 | 基線 Vitest 5檔46項通過／0失敗；新程式測試、全量、Preview與真機未做 | 使用者確認B1/B2後才施工；git proxy失敗，施工須取得最新完整checkout |
| B1 | fix/course-settings-three-state-20261012；PR#1314；遠端head f34fe5520e8ea4115a84d6ee6c517597d360d55b | 三個課程入口、空狀態、直連panel阻擋；2個產品UI檔＋既有精確支線隔離guard | Exact-head CI四job通過：完整9997passed／129skipped；Targeted2210passed；唯一Git Preview READY；Chromium合成36組通過 | 登入後隔離驗收待使用者安全登入；兩測試店與帳號狀態已唯讀核實，最小步驟見批次紀錄；保持Draft、不合併正式 |
| B2 | 尚未建立；沒有head | SPA立即文字篩選 | 新互動測試與Preview未做 | 等待確認；核對完整與分頁資料範圍 |
| V3–V5 | 尚未建立 | 僅核實後決定 | 裝置、故障注入與端到端未做 | 不把待驗證當缺口；記錄具體證據再排修補 |
| V6 | 無產品支線 | 真實iPad/Safari與延期390px | 未做 | 需真機與隔離登入情境；保持待補 |

接續時先讀此表、基線與相關PR最新head，對比main和檔案。每批更新實際支線、完整SHA、檔案、命令、passed/failed/skipped/not-run、Preview精確SHA、受影響入口及尺寸、阻擋原因與下一步。若同需求已有開啟PR，更新原批，不建立第二份。舊結果只屬其測試SHA，不沿用成最新全綠。

本案隔離驗收只使用已核實虛構資料或合成fixture。遠端推送／Preview／發布、DB或安全設定須依具体范围另確認；本次確認只授權相應程式施工，不自動擴大為正式合併。不得透過一般 build 執行未核准 migrations。

本輪基線測試命令：`npx vitest run src/__tests__/settings-nested-feature-presentation.test.ts src/__tests__/course-settings-workspace-ui.test.ts src/__tests__/spa-customer-auto-search.test.ts src/__tests__/client-read-cache.test.ts src/__tests__/operation-return-position.test.ts`。在本機 f3ef9868 執行，5檔／46項通過，只證明既有測試未失敗；現有測試並未捕捉 H01–H03 或 F01 新要求，不等於缺口已修。CSV 與文件為新增未提交檔，沒有開啟PR或發布。

上述5檔46項是初次盤點歷史基線；B1的新驗證與提交以獨立批次紀錄為準。B1執行前重查遠端main仍為695df9e2，open PR仍為#1310/#1307/#1245；結束時#1310已更新為637552bfe7a78257a182c2174d07a1327a5a40d0，沒有同需求課程設定PR。Git代理仍不可用，透過GitHub連接器取得#1309全部35個變更檔，驗證每檔blob、完整tree c9620dd5eb60092eb27b03312dd7d393688af164與signed commit SHA相同後，已建立真正以最新main為base的本機支線；不再受初次盤點的舊checkout限制。
