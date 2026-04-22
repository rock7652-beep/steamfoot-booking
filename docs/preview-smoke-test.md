# Preview Smoke Test

## 目標

確認 Preview 環境 auth flow 正常。**只驗 credential login，不驗 OAuth。**

前置：PR2-b 完成（Vercel env 已對齊、Preview DB 已指到 demo DB）。

---

## 測試項目

### 1. Credential 登入（`/hq/login`）

- 進 preview URL 的 `/hq/login`
- 輸入 demo 後台帳號（見 demo 帳號文件）
- **預期：** 成功登入，跳轉到對應後台 dashboard

**錯誤訊息驗收（PR1）：**
- 不存在的 email → 顯示「此帳號不存在」
- 存在但密碼錯 → 顯示「密碼錯誤」
- DB 連不上 → 顯示「系統暫時異常」

---

### 2. 登出

- 點右上角 / 側邊欄登出
- **預期：**
  - 登出後停留在 preview domain（例：`steamfoot-booking-xxx.vercel.app`）
  - **不會跳到 `www.steamfoot.com`**
  - Cookie 被清除（devtools 驗）

---

### 3. URL host 檢查

登入整個流程中，用瀏覽器 devtools 監看：

- [ ] Request host 始終是 preview domain
- [ ] Response Set-Cookie 的 Domain 不是 `.steamfoot.com`
- [ ] 沒有任何 302 redirect 指向 `www.steamfoot.com`

---

### 4. Email 連結（若觸發）

若 smoke test 觸發到寄 email 的流程（開通、密碼重設、提醒）：

- [ ] Email 連結指向 preview domain，**不是** `www.steamfoot.com`
- [ ] 連結點開後會進 preview 頁面

若 Preview 沒設 `RESEND_API_KEY`，email 會寫到 Vercel server logs，可從 function log 驗證連結內容。

---

### 5. Console warning 檢查

開啟瀏覽器 devtools console / Vercel function logs：

- [ ] 若 Preview 環境誤設了 `NEXTAUTH_URL`，`base-url.ts` 會印警告：
  ```
  [base-url] NEXTAUTH_URL 不應在 Preview 設定 — 應依賴 VERCEL_URL
  ```
- 看到這訊息 → 回 Vercel 面板移除 `NEXTAUTH_URL` on Preview。

---

## 不測項目

以下流程**不在 Preview smoke test 範圍**：

- ❌ OAuth login（LINE / Google） — 見 `deployment.md` → OAuth Support Policy
- ❌ 真實寄 email 到實體信箱（Preview 建議用 console.log 模式）
- ❌ LINE Webhook / 推播 — 需另配 Preview LINE channel

這些流程僅在 Production 驗收。

---

## 驗收紀錄模板

建議每次 PR 驗收時附在 PR comment：

```markdown
### Preview Smoke Test

- Preview URL: <https://...>
- Tested at: YYYY-MM-DD HH:MM
- Tester: @xxx

| 項目 | 結果 |
|---|---|
| 1. Credential 登入 | ✅ / ❌ |
| 2. 登出 host | ✅ / ❌ |
| 3. URL host 檢查 | ✅ / ❌ |
| 4. Email 連結 | ✅ / ❌ / N/A |
| 5. Console warning | ✅ / ❌ |

備註：...
```

---

## 失敗時 debug 流程

1. **先看 Vercel function logs** — `[auth]` / `[base-url]` warnings 會印在這
2. **檢查 Vercel env 設定** — Project Settings → Environment Variables → Preview
   - `NEXTAUTH_URL` 應為空
   - `DATABASE_URL` 應指向 demo DB
   - `NEXTAUTH_SECRET` 應與 Production 相同
3. **對照** `docs/deployment.md` → **Common Issues** 段落
4. **若仍失敗** — 回報時請附：Preview URL、function log 截圖、使用的帳號
