import { useState } from "react";
// Synthetic local Preview: real components, mocked image API; no login or database.
import { createRoot } from "react-dom/client";
import { ImageAnnouncementManager } from "../../src/components/image-announcements/manager";
import { ImageAnnouncementCarousel } from "../../src/components/image-announcements/carousel";
import type { ImageAnnouncement } from "../../src/lib/image-announcements";
import "../../src/app/globals.css";
import "../../src/app/(customer)/book/course-portal.css";
const items: ImageAnnouncement[] = Array.from({ length: 3 }, (_, index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 1}`, startsOn: "", endsOn: "", enabled: true }));
const front = new URLSearchParams(location.search).has("front");
const readonly = new URLSearchParams(location.search).has("readonly");
function FrontFixture() {
  const [view, setView] = useState("首頁");
  return <main className="course-portal space-y-3 p-3 pb-24">
    <div className="rounded-xl bg-white p-3">既有首頁內容</div>
    <ImageAnnouncementCarousel storeSlug="synthetic" items={new URLSearchParams(location.search).has("empty") ? [] : new URLSearchParams(location.search).has("inactive") ? items.map(item => ({ ...item, enabled: false })) : items} />
    <section className="h-[1000px] rounded-xl bg-white p-3"><h2>{view === "首頁" ? "已預約清單" : "預約功能"}</h2><input aria-label="原本輸入" defaultValue="保留內容" /></section>
    {/* Existing course navigation CSS, with synthetic local click handlers. */}
    <nav className="cp-nav" aria-label="底部功能"><button type="button" onClick={() => setView("首頁")}>首頁</button><button type="button" onClick={() => setView("預約")}>預約</button></nav>
  </main>;
}
createRoot(document.getElementById("root")!).render(front ? <FrontFixture /> : <main className="min-h-screen bg-earth-50 p-4 text-earth-800"><h1 className="mb-2 text-base font-semibold">圖片公告</h1><p className="mb-3 text-sm">上傳圖片，顯示於前台首頁，顧客可點擊放大查看。</p><ImageAnnouncementManager initial={{ revision: 0, items }} storeId="synthetic" storeSlug="synthetic" canManage={!readonly} /></main>);
