// Synthetic local Preview: real components, mocked image API; no login or database.
import { createRoot } from "react-dom/client";
import { ImageAnnouncementManager } from "../../src/components/image-announcements/manager";
import { ImageAnnouncementCarousel } from "../../src/components/image-announcements/carousel";
import type { ImageAnnouncement } from "../../src/lib/image-announcements";
import "../../src/app/globals.css";
import "../../src/app/(customer)/book/course-portal.css";
const items: ImageAnnouncement[] = Array.from({ length: 3 }, (_, index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 1}`, modules: ["steamfoot"], startsOn: "", endsOn: "", enabled: true }));
const front = new URLSearchParams(location.search).has("front");
const readonly = new URLSearchParams(location.search).has("readonly");
createRoot(document.getElementById("root")!).render(front ? <main className="course-portal space-y-3 p-3"><div className="h-60 rounded-xl bg-white p-3">既有首頁內容</div><ImageAnnouncementCarousel storeSlug="synthetic" items={items} /><section className="h-[1000px] rounded-xl bg-white p-3">已預約清單<input aria-label="原本輸入" defaultValue="保留內容" /></section></main> : <main className="min-h-screen bg-earth-50 p-4 text-earth-800"><h1 className="mb-2 text-base font-semibold">圖片公告</h1><p className="mb-3 text-sm">上傳圖片，顯示於前台首頁，顧客可點擊放大查看。</p><ImageAnnouncementManager initial={{ revision: 0, items }} storeId="synthetic" storeSlug="synthetic" defaultModule="steamfoot" canManage={!readonly} /></main>);
