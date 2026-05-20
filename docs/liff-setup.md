# LIFF Setup（PR-A）

> 範圍：竹北店 MVP。第二家店上線前會以 `Store.liffId` migration 取代環境變數（PR-E）。
> 上層 plan：[docs/line-mini-app-plan.md](./line-mini-app-plan.md)

## 1. LINE Developers Console 設定步驟

> 操作角色：擁有蒸足 LINE Developers 工作區 admin 權限的人。

### 1.1 確認 / 建立 LINE Login channel

1. 進入 [LINE Developers Console](https://developers.line.biz/console/)
2. 選擇蒸足的 Provider（若無 → 先建 Provider「Steamfoot」）
3. 在該 Provider 下確認是否已有 **LINE Login** channel
   - **MVP 階段**：竹北店共用既有 channel（與 NextAuth `LINE_LOGIN_CHANNEL_ID/SECRET` 同一個）
   - 多店期：每店一個 channel，由 PR-G 處理

### 1.2 建立 LIFF App

在剛剛的 LINE Login channel 內：

1. 開「LIFF」分頁 → 點「Add」
2. 填入以下設定：

| 欄位 | 值 | 說明 |
|---|---|---|
| LIFF app name | `Steamfoot 竹北` | 用於辨識，使用者看不到 |
| Size | `Full` | 全螢幕；MVP 需要 |
| Endpoint URL | `https://www.steamfoot.com/s/zhubei/liff` | **務必照這個 path**；proxy 已就緒 |
| Scope | `profile`、`openid` | PR-B 之後會用 idToken 走後端 verify，須含 `openid` |
| Bot link feature | `On (Aggressive)` | 進站時引導加官方帳號好友 |
| Module mode | `Off` | 一般 mode 即可 |

3. 建立後會得到 **LIFF ID**（格式 `1234567890-abcdefgh`）。複製下來。

### 1.3 將 LIFF ID 寫入環境變數

| 環境 | 操作 |
|---|---|
| 本機 dev | 編輯 `.env.local`，加 `NEXT_PUBLIC_LIFF_ID_ZHUBEI="1234567890-abcdefgh"` |
| Vercel preview | Vercel Dashboard → Settings → Environment Variables → 加 `NEXT_PUBLIC_LIFF_ID_ZHUBEI`（scope=Preview）|
| Vercel production | 同上但 scope=Production；**留到 PR-D 上線前才寫入**，PR-A merge 不必動 prod |

> ⚠️ 因為是 `NEXT_PUBLIC_*`，會打包到 client bundle；LIFF ID 本身不算機密，可外露。
> 真正不能外露的是 channel secret（已存在 `LINE_LOGIN_CHANNEL_SECRET`）。

## 2. 本地驗收

```bash
# 1. 寫入 .env.local
echo 'NEXT_PUBLIC_LIFF_ID_ZHUBEI="1234567890-abcdefgh"' >> .env.local

# 2. 啟動 dev server
npm run dev

# 3. 瀏覽器開
open http://localhost:3000/s/zhubei/liff
```

預期：

- ✅ 頁面顯示「LINE Mini App / 竹北店 / /s/zhubei/liff」
- ✅ 短暫顯示「LIFF 初始化中…」後切換到 ready 狀態
- ✅ 出現提示「目前不在 LINE 內，部分功能將無法使用」（因為一般瀏覽器不是 LINE App）
- ✅ 兩顆 disabled 按鈕「預約體驗（即將開放）」「我的資料（即將開放）」
- ✅ 未登入瀏覽不會被 redirect 到 `/s/zhubei/`

若沒填 `NEXT_PUBLIC_LIFF_ID_ZHUBEI`：

- ✅ 頁面顯示「竹北店 尚未開通 LINE Mini App」（明確錯誤頁，不 crash）

## 3. LINE 內驗收（PR-A 階段）

開 LIFF URL：`https://liff.line.me/<LIFF_ID>`

- ✅ 在 LINE 內開啟會 redirect 到 endpoint URL `/s/zhubei/liff`
- ✅ 顯示「已在 LINE App 內開啟」
- ✅ 兩顆 disabled CTA

PR-A 不接登入、不接綁定、不接預約；上述行為足夠驗收。

## 4. 不在 PR-A 範圍

- ❌ idToken exchange → PR-B
- ❌ Customer binding → PR-C
- ❌ 體驗預約 → PR-D
- ❌ `Store.liffId` migration → PR-E
- ❌ Rich Menu 模板 → PR-F
- ❌ 每店一個 LINE Login channel → PR-G

## 5. 新增分店時要做的事（多店期）

PR-E 之後，新增分店要 LIFF 入口時：

1. 在 LINE Developers Console 新建一個 LIFF（endpoint URL 改為 `https://www.steamfoot.com/s/{newSlug}/liff`）
2. 拿到 LIFF ID → 寫進 `Store.liffId`（後台 `/hq/dashboard/stores/new` 或 edit）
3. 把 `src/app/(liff)/liff/page.tsx` 裡的 `LIFF_ID_BY_SLUG` dict 整段替換為 DB 查詢
4. 不需要 fork 任何頁面

PR-A 之前完成的事：
- [x] 路由 `/s/[slug]/liff` 已就緒
- [x] proxy 公開白名單已加 `/liff`
- [x] `@line/liff` SDK 已安裝
- [x] LIFF shell + 三態 UI 已就緒
