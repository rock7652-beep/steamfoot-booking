// Actual AI panel and shared SettingsListRow. Actions are intercepted by the browser harness.
import { createRoot } from "react-dom/client";
import { AiButlerPanel } from "../../src/app/(dashboard)/dashboard/settings/digital-butler/ai-panel";
createRoot(document.getElementById("root")!).render(<main className="mx-auto min-w-0 max-w-5xl space-y-3 p-3"><p className="text-sm">合成資料介面驗收・不連線資料庫或 OpenAI</p><AiButlerPanel setting={{ enabled: false, model: "gpt-6-luna", channels: ["TEST"], monthlyBudgetMicros: 1_000_000, dailyRequests: 20, monthlyRequests: 100 }} revision={0} liveTestAvailable={false} requestCount="0" reservedMicros="0" budgetMicros={1_000_000} alerts={[]} /></main>);
