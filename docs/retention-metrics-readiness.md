# 留存指標 Readiness

## 判讀方式

- 狀態只使用 `READY`、`PARTIAL`、`MISSING`、`UNKNOWN`、`BLOCKED_BY_DEFINITION`。
- Data Confidence 使用 `HIGH`、`MEDIUM`、`LOW`、`UNKNOWN`。
- `READY` 代表資料與商業定義都足以開發；「資料存在」不等於定義已完成。
- 詳細證據、候選公式與限制見 [retention-metrics-definition-audit.md](./retention-metrics-definition-audit.md)。

## Readiness Matrix

| 指標 | 狀態 | Data Confidence | 商業定義狀態 | 缺少什麼 | 建議下一步 |
| --- | --- | --- | --- | --- | --- |
| 回流人數 | `BLOCKED_BY_DEFINITION` | HIGH（單店 Booking） | A／B／C 候選未定案 | cohort、觀察窗與跨店規則 | 業務選定口徑；A 已是 KPI-3 舊客數，不重做 |
| 回流率 | `BLOCKED_BY_DEFINITION` | HIGH（A／B 單店）；PARTIAL（C） | 三種分母回答不同問題 | 正式分母、觀察窗、應回流規則 | 優先評估並批准 B；不可沿用 legacy 名稱即定案 |
| 未回流人數 | `BLOCKED_BY_DEFINITION` | HIGH（A）；PARTIAL（B／C） | A／B／C 未定案 | cohort、等待期與 N 天 | 與回流率同一決策中定義，避免提前判定流失 |
| 續約人數 | `BLOCKED_BY_DEFINITION` | MEDIUM | 統計單位與續約視窗未定 | 方案／Wallet／顧客單位、換方案、退款與跨店規則 | 先完成續約資格決策，再做資料抽樣 |
| 續約率 | `BLOCKED_BY_DEFINITION` | MEDIUM | 分子與四種候選分母未定 | 有資格續約 cohort、視窗、多 Wallet 去重 | 另開定義決策；不可把既有「本期購買者中的舊買家占比」當正式續約率 |
| 未續約人數 | `BLOCKED_BY_DEFINITION` | MEDIUM | 未續約成立時間未定 | 完整等待窗及資格 cohort | 續約定義完成後再定，不能立即以差額判斷 |
| 未續約率 | `BLOCKED_BY_DEFINITION` | MEDIUM | 是否等於 `1 - 續約率` 未定 | 等待窗、排除規則與分母 | 與續約率同時定案 |
| 平均回店天數 | `BLOCKED_BY_DEFINITION` | HIGH（單店 Booking 日期） | 平均方法、去重、排除與跨期規則未定 | 統計單位、同日與異常值政策 | 先用匿名樣本比較候選算法，不進正式 UI |
| 人員回流率 | `BLOCKED_BY_DEFINITION` | MEDIUM | 人員歸屬與全店回流率皆未定 | assigned／service／revenue staff 選擇 | 全店口徑定案後另做一支 PR |
| 店舖回流率 | `BLOCKED_BY_DEFINITION` | HIGH（單店）；LOW（HQ 去重） | 店舖與跨店歸屬未定 | A→B 店回流歸屬、canonical identity | KPI-5B 僅支援單店／viewed store；HQ 暫停 |

目前沒有任何新留存指標同時滿足資料與商業定義的 `READY` 條件。唯一已可靠且已上線的是 KPI-3「舊客數」（候選回流人數 A），不應在 KPI-5B 重複實作。

## 資料缺口摘要

- `Booking` 足以支援單店的 completed-service cohort，但歷史完整性仍需 production-safe 抽樣 Audit。
- `firstVisitAt`／`lastVisitAt` nullable 且有 stale 證據；正式留存統計應從 `COMPLETED` Booking 重建。
- Wallet／Transaction 可觀察購買與權益，但沒有 `PACKAGE_RENEWAL` 或前後方案關係；續約只能在定義完成後推導。
- `CustomerIdentityLink` 不是全體顧客的品牌級 identity master；HQ all-store 去重信心低。
- merged source row 保留，未來 Query 必須 canonicalize，不能只做裸 `distinct customerId`。

## KPI-5B 建議 Gate

開始開發前必須同時滿足：

1. 業務書面選定回流候選 B（或提供另一正式定義）。
2. 明確確認月份、店舖時區、單店隔離及 0 基期規則。
3. 明確確認同月多次與同日多次均以唯一 customerId 去重。
4. 確認 merged customer canonicalization 策略。
5. 明確接受 HQ all-store 暫不支援。

若完成上述 Gate，最小 Scope 為：

- 上月來客中本月回流人數。
- 上月 cohort 回流率。
- 上月來客中本月未回流人數。
- 僅 active store／viewed store；不含續約、平均回店天數、人員、來源或跨店分析。

若業務不批准候選 B，下一步應繼續定義，不應為了交付而把 KPI-3 舊客數改名再做一次。
