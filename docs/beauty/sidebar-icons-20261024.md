# 美業左側功能圖示

美業原選單產生器以工單項目當預設，導致多數功能均呈現工單圖示。改為明確依功能取用共用圖示；保留項目順序、路由、文字及權限／功能開關。

| 功能 | 圖示 |
| --- | --- |
| 首頁 | 房屋 |
| 班表 | 日曆 |
| 顧客管理 | 顧客群組 |
| 顧客經營 | 成長火箭 |
| 營運 | 金額 |
| 分析 | 長條圖 |
| 位置管理 | 樓宇 |
| 服務項目 | 書本 |
| 收費方式 | 方案疊層 |
| 技師管理 | 人像與識別證 |
| 人員管理 | 人員群組 |
| 圖片公告 | 圖片 |
| 設定 | 齒輪 |

服務與位置圖示抽成共用元件，音樂／運動原本的書本及樓宇圖形保留；美業直接使用同一元件。新識別證與圖片圖示沿用20px、1.8線寬。收合提示及無障礙名稱保留。

導覽相關既有3檔／63項通過，ESLint及diff檢查通過。本機合成店實際登入預覽5項通過：十三個圖示尺寸、1366×900及1024×768、收合模式提示、768×1024選單抽屜，沒有pageerror。不是實體裝置或本輪後台業務流程重驗。

[調整前：既有最終版班表](evidence/20261024-native-hosted/page-班表-1024.png)；調整後：[桌機](evidence/20261024-sidebar-icons/expanded-1366.png)、[平板](evidence/20261024-sidebar-icons/expanded-1024.png)、[收合](evidence/20261024-sidebar-icons/collapsed-1024.png)、[平板抽屜](evidence/20261024-sidebar-icons/drawer-768.png)。前圖為先前隔離站，後圖為本機合成店；比較圖示，非相同店家內容。

本輪無資料庫升級或遠端資料異動。僅更新既有隔離支線；LINE關閉，正式站不動。

完整版本 `0a6b8dbd` 已部署至[隔離測試站](https://steamfoot-booking-of29ce6gu-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/admin/dashboard/beauty)，`dpl_HhKZjSPMdySD5dj5XhCunrEVkngy`，READY／Preview。完整編譯及TypeScript通過。本次視覺檢查在本機實際側欄完成；未重新建立遠端存取連結或冒稱已重驗遠端登入／業務流程。
