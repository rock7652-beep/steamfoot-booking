# P1 Hotfix — LINE 分享未使用店家最新自訂模板

## 問題

正式站店長儲存店別自訂推薦分享文案後：

- 「複製分享文字」使用最新自訂文案。
- 「立即用 LINE 分享」仍出現系統預設文案。

兩個入口理應由同一份 `shareText` 產生，實際行為不一致。

## 正確規格

- 複製與 LINE 分享必須使用同一份最新店別模板。
- `{storeName}` 與 `{url}` 必須正確渲染。
- 店別未設定模板時，才使用系統預設 fallback。
- 竹北、新竹等不同店別不得互相讀取模板。

## 修復範圍

- 盤查 `buildLineShareUrl()` 與 LINE deep link 編碼。
- 盤查所有 LINE 分享入口是否傳入最新 `shareTemplate`。
- 排除舊 render、舊 href 或快取保留預設文案。
- 補自訂模板、換行、Emoji、特殊字元與預設 fallback 測試。
- Preview 實測複製與 LINE 編輯畫面內容完全一致。

## 安全限制

- Draft PR。
- 不 merge，除非 Preview 驗收 PASS 且取得明確授權。
- 不改 schema，不新增 migration。
- 不操作 Production DB。
- 不手動部署 Production。
- 不顯示 secrets。

## 驗收文案

```text
LINE 自訂模板測試 0715
{storeName}
{url}
```

## 驗收項目

1. 複製文字包含測試標記。
2. LINE 分享編輯畫面包含相同測試標記。
3. 兩邊完整文字、換行、店名與推薦網址一致。
4. 儲存第二份模板並重新整理後，兩個入口同步更新。
5. 恢復系統預設後，兩個入口都使用預設文案。
6. 跨店模板隔離正常。
