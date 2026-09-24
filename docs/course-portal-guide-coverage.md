# 課程前台指南補強（草稿）

2026-09-24，基準 main `f31da314`。會員與教練一起補齊，不自動合併。

## 內容與入口

- 會員原有 4 題擴寫 CP01–CP04，新增 CP05–CP10，共 10 題；未開通健康功能時 9 題。
- 教練新增 CP11–CP16，共 6 題；從我的工作右上角帳號選單進入。
- 會員仍使用首頁原有操作指南入口。依當前身分篩選及搜尋，不混入店長教學。
- 本批新增 12 題、更新 4 題，16 題待實際角色登入後驗收；與後台 129 篇目錄分開計數。

| 範圍 | ID | 核對來源 |
| --- | --- | --- |
| 預約、取消、額度、共卡 | CP01–CP05 | course-portal-client.tsx、actions/course-members.ts、services/course-booking.ts |
| 購買與轉帳、紀錄 | CP06–CP08 | course-portal-client.tsx、actions/course-portal.ts |
| 健康量測 | CP09 | components/course-health-workspace.tsx、actions/course-health.ts |
| 雙身分與工作入口 | CP10、CP16 | course-portal-client.tsx、course-portal.tsx |
| 課表、名單、點名、更正、備註、授課紀錄 | CP11–CP15 | course-portal-client.tsx、actions/course-portal.ts |

## 驗證

28 項相關測試、TypeScript、變更檔 ESLint、diff check 通過。角色篩選、健康開通條件及關鍵詞查詢已用測試核對。

程式核對與單元測試不能代替會員／教練實際登入驗收。尚待：兩種身分指南開啟、搜尋、展開／收合、返回，健康未開通篩選、手機鍵盤及長文滑動。原後台驗收紀錄不挪作前台通過證據。未新增顧客、預約、通知或修改營運規則。
