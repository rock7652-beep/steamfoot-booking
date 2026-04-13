/**
 * MVP 階段隱藏功能清單
 *
 * 產品方向聚焦：AI健康評估、預約管理、顧客管理、收款紀錄
 * 其他進階營運功能暫時收起，避免後台過重。
 *
 * ⚠️  只做「隱藏」，不刪除頁面檔案 / 元件 / 資料表 / migration。
 *     日後重新開放只需從此清單移除對應路徑即可。
 */

/** 被隱藏的路由前綴（sidebar 過濾 + 路由守衛共用） */
export const MVP_HIDDEN_ROUTES: string[] = [
  "/dashboard/ops",             // 營運儀表板
  "/dashboard/ranking",         // 排行榜
  "/dashboard/analytics",       // 聯盟數據
  "/dashboard/upgrade-requests", // 升級申請管理
];

/** 判斷某路徑是否屬於 MVP 隱藏範圍 */
export function isMvpHidden(pathname: string): boolean {
  return MVP_HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}
