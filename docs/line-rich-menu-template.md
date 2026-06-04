# LINE Rich Menu / LIFF 入口 URL Mapping（正式 SOP）

> **狀態**：正式文件（docs-only）。
> **建立緣由**：LINE / LIFF identity convergence（PR #256）與「LIFF 我的資料」（PR #257）已上線後，整理 Rich Menu 每一格應導向哪個 URL，避免**會員中心 LIFF** 與 **健康評估 LIFF** 混淆。
> **適用範圍**：竹北店（zhubei）現行；新竹店（hsinchu）未來複製依此文件。
> **本文件只描述對應關係，不改任何 code / LINE OA 設定。**

---

## 0. 一句話總結

8 格 Rich Menu 全部對應到「既有 live LIFF route / 外部 HealthFlow / LINE OA 聊天」，**純 LINE OA 後台設定即可，零功能 code PR**。唯一缺口「顧客案例」route 不存在，暫緩。

---

## 1. 兩個 LIFF ID 的正確分工 ⚠️

系統有**兩個用途完全不同**的 LIFF App，請勿混用：

| 用途 | LIFF URL | Endpoint（production） | 設定位置 |
|---|---|---|---|
| **蒸足會員中心 / 預約系統** | `https://liff.line.me/2009711308-47Ffoh9r` | `https://www.steamfoot.com/s/zhubei/liff` | LINE Console + prod env `NEXT_PUBLIC_LIFF_ID_ZHUBEI` / `Store.liffId`（DB） |
| **HealthFlow / AI 健康評估** | `https://liff.line.me/2009744225-9aSc04fR` | `https://www.healthflow-ai.com/liff`（外部獨立 App） | 硬編於 `src/lib/liff/messages.ts` 的 `healthFlowLiffUrl` 常數 |

```text
會員中心 / 預約 / 我的預約 / 剩餘堂數 / 我的資料 / 健康紀錄  →  2009711308-47Ffoh9r
AI 健康評估（外部 HealthFlow）                              →  2009744225-9aSc04fR
```

### 🚨 重要警告

- **不要**把 `2009744225-9aSc04fR`（健康評估）當成蒸足會員中心入口。它是 HealthFlow 的外部 App。
- 會員中心 / 預約 / 我的預約 / 剩餘堂數 / 我的資料 / 健康紀錄 **一律**使用 `2009711308-47Ffoh9r`。
- HealthFlow 是**獨立 LIFF App，用自己的 LIFF ID 處理 LINE 身分**；蒸足不傳任何 identity 參數（customerId / storeId / lineUserId / phone / name），純導流入口。

### Deep link 機制

會員中心 LIFF 支援 deep link：

```text
https://liff.line.me/2009711308-47Ffoh9r/{subpath}
  → 開啟 https://www.steamfoot.com/s/zhubei/liff/{subpath}
```

LIFF 會把 LIFF ID 之後的路徑接到 endpoint URL 後面。因為 **storeSlug 包在 endpoint 路徑裡（`/s/zhubei/liff`）而非 query param**，deep link 會自動保留店別 context，多店也安全。

---

## 2. 推薦 Rich Menu 8 格 mapping

```text
第一排： [ 立即預約 ] [ 體驗預約 ] [ 我的預約 ] [ 剩餘堂數 ]
第二排： [ AI健康評估] [ 健康紀錄 ] [ 我的資料 ] [ 聯絡店長 ]
```

---

## 3. 每一格詳細對應

### 第一排

| 按鈕名稱 | 目標 URL | LIFF ID / web URL | 已可用 | 需 LINE session | 會進 onboarding | 風險與備註 |
|---|---|---|---|---|---|---|
| **立即預約** | `https://liff.line.me/2009711308-47Ffoh9r/member-booking` | 會員中心 LIFF | ✅ | 是 | 未綁定→落地頁 boundary，提供「回首頁」由首頁接 onboarding | 無剩餘堂數者會看到 no-wallet card；建議文案引導去體驗預約。亦可命名「課程預約」更精準 |
| **體驗預約** | `https://liff.line.me/2009711308-47Ffoh9r/trial-booking` | 會員中心 LIFF | ✅ | 是 | 同上 | 新客主入口，風險低 |
| **我的預約** | `https://liff.line.me/2009711308-47Ffoh9r/bookings` | 會員中心 LIFF | ✅ | 是 | 未綁定→`no_customer` boundary，提供「回首頁」 | 含取消 / 改期；風險低 |
| **剩餘堂數** | `https://liff.line.me/2009711308-47Ffoh9r/wallets` | 會員中心 LIFF | ✅ | 是 | 同上 | = 我的方案；風險低 |

### 第二排

| 按鈕名稱 | 目標 URL | LIFF ID / web URL | 已可用 | 需 LINE session | 會進 onboarding | 風險與備註 |
|---|---|---|---|---|---|---|
| **AI 健康評估** | `https://liff.line.me/2009744225-9aSc04fR` | **HealthFlow LIFF（外部）** | ✅ | HealthFlow 自管 LINE 身分 | 否（外部 App） | **直接用健康評估 LIFF ID，不要走會員中心**。外部 first-load 體驗（白頁 / loading / timeout）屬 HealthFlow 端責任 |
| **健康紀錄** | `https://liff.line.me/2009711308-47Ffoh9r/health` | 會員中心 LIFF | ✅ | 是 | 未綁定→「尚未完成評估」+ 外部評估 CTA | 內部 summary 頁（6 指標 + 評分卡）；未連結 HealthFlow 者看 empty state。與「AI 健康評估」互補：看紀錄 vs 做評估 |
| **我的資料** | `https://liff.line.me/2009711308-47Ffoh9r/profile` | 會員中心 LIFF | ✅ | 是 | 未綁定→落地頁 boundary | read-only（PR #257）；風險低 |
| **聯絡店長** | `https://line.me/R/ti/p/@083vmikb` | LINE OA chat | ✅ | 否 | 否 | 此值為**竹北 OA**（per-store）。建議 Rich Menu 用 LINE 原生「開啟聊天」action，免 LIFF。多店前 hsinchu 需補自己的 OA |

> **顧客案例**：route 不存在，**本版不放**（見 §7）。版型若要保留第二排第 3 格，可暫以「我的資料」遞補。

---

## 4. Canonical URL table

```text
# 會員中心 LIFF（2009711308-47Ffoh9r）— production 解析為 https://www.steamfoot.com/s/zhubei/liff/...
會員中心首頁    https://liff.line.me/2009711308-47Ffoh9r
立即/課程預約   https://liff.line.me/2009711308-47Ffoh9r/member-booking
體驗預約        https://liff.line.me/2009711308-47Ffoh9r/trial-booking
我的預約        https://liff.line.me/2009711308-47Ffoh9r/bookings
剩餘堂數/方案   https://liff.line.me/2009711308-47Ffoh9r/wallets
我的資料        https://liff.line.me/2009711308-47Ffoh9r/profile
健康紀錄(內部)  https://liff.line.me/2009711308-47Ffoh9r/health

# 健康評估 LIFF（外部 HealthFlow）
AI 健康評估     https://liff.line.me/2009744225-9aSc04fR

# 聯絡店長（竹北 LINE OA chat）
聯絡店長        https://line.me/R/ti/p/@083vmikb
```

> 注意：`2009744225-9aSc04fR` 是**健康評估**，不是會員中心。
>
> `…/profile`（我的資料）route 自 **PR #257** 起在 production 可用（`src/app/(liff)/liff/profile/`），已通過 iPhone smoke。請勿因 stale review 移除此 mapping。

---

## 5. Deep link vs LIFF home 結論

**推薦：交易型按鈕用 deep link，不需要全部導回 LIFF home。**

- **老客常用功能（立即預約 / 體驗預約 / 我的預約 / 剩餘堂數 / 我的資料 / 健康紀錄）可直接 deep link**，最省步驟、體驗最好。
- 每個 LIFF 子頁各自獨立 `initLiff()` + `getIDToken()`，server action 走 status discriminated union、不 throw；**未綁定顧客 deep link 進子頁會看到 graceful boundary，並被引導回首頁 / onboarding**，不會白頁或崩潰。
- onboarding funnel 仍集中在**首頁 shell**（未綁定→自動導 `/onboarding`；已綁定→出 CTA）。新客 deep link 子頁僅多一跳，可接受。
- **不需要**把所有格子都先導回 LIFF home——那會讓老客每次多點一次。
- session 失效時子頁顯示 `expired` retry，而非首頁完整歡迎流程，可接受。

---

## 6. 多店擴充 notes（zhubei → hsinchu）

架構**可複製、無寫死竹北的 blocker**。路由全程 `storeSlug`-parameterized（proxy 抽 slug → `x-store-slug` header → `resolveStorePresentation`）。

**欄位來源（以實際 code 為準）**：LIFF 顯示資料由 `resolveStorePresentation(slug)`（`src/lib/store-resolver.ts`）組裝，實際讀取：
- `Store.liffId` → LIFF ID（未填則 fallback env `NEXT_PUBLIC_LIFF_ID_<SLUG>`）
- `ShopConfig.lineOfficialUrl` → 聯絡店長 / contactUrl
- `ShopConfig.address` → 地址
- `ShopConfig.mapUrl` → 地圖

| 項目 | 實際讀取欄位 | zhubei（現行） | hsinchu（未來） |
|---|---|---|---|
| LIFF ID | `Store.liffId` | `2009711308-47Ffoh9r` | **需註冊獨立 LIFF ID** + 設 `Store.liffId`，endpoint `https://www.steamfoot.com/s/hsinchu/liff` |
| 聯絡店長 / OA | `ShopConfig.lineOfficialUrl` | 已設（`@083vmikb`） | 需補 hsinchu OA |
| 地址 | `ShopConfig.address` | 已設 | 需補 hsinchu 實際值 |
| 地圖 | `ShopConfig.mapUrl` | 已設 | 需補 hsinchu 實際值 |
| LINE OA Rich Menu | （LINE 後台，非 DB） | 竹北 OA | hsinchu OA，deep link 換成該店 LIFF ID |
| HealthFlow LIFF | （硬編常數，全店共用） | `2009744225-9aSc04fR` | **刻意全店共用**（HealthFlow 不分店） |

> ⚠️ **避免 fallback 到竹北資料**：`resolveStorePresentation` 在 `ShopConfig.lineOfficialUrl / address / mapUrl` 為 null 時，會 fallback 到竹北 fallback 常數（`src/lib/store-resolver.ts` 的 `FALLBACK_*`，值來自 `src/lib/liff/messages.ts`）。hsinchu 若這幾個 `ShopConfig` 欄位留 null，LIFF 會顯示**竹北**的聯絡 / 地址 / 地圖。hsinchu 上線前**必須補齊該店的 `ShopConfig.lineOfficialUrl` / `ShopConfig.address` / `ShopConfig.mapUrl`**。

> ⚠️ **不要照 `Store.contactUrl` / `Store.address` / `Store.mapUrl` 設定**——這些**不是** LIFF presentation 讀取的欄位，補在那裡 LIFF 不會生效，仍會 fallback 竹北。正確欄位是上表的 `ShopConfig.*`。`Store.liffId` 是唯一讀 `Store` 的欄位，仍需各店設定。

---

## 7. 暫緩項目 / 本次明確不做

- ⏸️ **顧客案例**：route 不存在，暫緩；**現在不要做顧客案例 PR**。
- ❌ 不改 code（不碰 `src/`）。
- ❌ 不設定 / 不改 LINE OA。
- ❌ 不碰 webhook / `auth.ts` / D3 / D5 / schema / migration / DB / env。
- ❌ 不開功能 PR。

---

## 8. 上線順序（建議）

```text
1. （本文件）docs-only PR：docs/line-rich-menu-template.md  ← merge 後即定為依據
2. 準備 Rich Menu 圖片素材（2500×1686 8 格，或 2500×843 single-row）
3. 到 LINE OA 後台手動設定 Rich Menu（8 個 tappable area，URL 用 §4）
4. 手機實測 8 格入口（含未綁定 / 已綁定兩種帳號）
```

設定 Rich Menu 時所需素材：

1. Rich Menu 底圖（LINE 規格尺寸）。
2. 8 個 tappable area 座標 + action：7 個 `uri` action（用 §4 URL），1 個（聯絡店長）建議用 LINE OA 原生「開啟聊天」。
3. 核對 prod env `NEXT_PUBLIC_LIFF_ID_ZHUBEI` / `Store.liffId`(zhubei) 實際值 = `2009711308-47Ffoh9r`。
