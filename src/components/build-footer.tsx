/**
 * 全站版本 Footer — 前台 / 後台 / 登入頁統一顯示
 *
 * 顯示：版本號 • build 時間 • 環境
 * 資料來源：next.config.ts 注入的 NEXT_PUBLIC_* 環境變數
 */

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";
const BUILD_ENV = process.env.NEXT_PUBLIC_BUILD_ENV || "dev";

export default function BuildFooter() {
  const parts = [`v${BUILD_VERSION}`];
  if (BUILD_TIME) parts.push(BUILD_TIME);
  parts.push(BUILD_ENV);

  return (
    <footer className="w-full py-2 text-center text-[10px] text-earth-300 select-none pointer-events-none">
      {parts.join(" • ")}
    </footer>
  );
}
