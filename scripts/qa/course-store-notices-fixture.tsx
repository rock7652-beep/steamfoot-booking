// Synthetic visual fixture. No application routes, credentials, or database access.
import {createRoot} from "react-dom/client";
import {CourseStoreNoticeBell} from "../../src/components/admin/course-store-notice-bell";
import "../../src/app/globals.css";
createRoot(document.getElementById("root")!).render(<main className="min-h-screen bg-earth-50 text-earth-800"><header className="flex items-center justify-between border-b bg-white px-4 py-2"><span>課表</span><div className="flex items-center gap-2"><CourseStoreNoticeBell storeId="synthetic"/><span>值班人員</span></div></header><section className="p-4"><label>保留中的輸入<input aria-label="保留中的輸入" className="m-2 rounded border bg-white p-2" defaultValue="交班備註"/></label></section></main>);
