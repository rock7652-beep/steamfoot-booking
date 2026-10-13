// Synthetic UI only: actual course settings components, no account or database.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CourseSettingsWorkspace } from "../../src/app/(dashboard)/dashboard/courses/settings-workspace";
import { FeaturePresentationProvider } from "../../src/components/feature-presentation";
import { FEATURES } from "../../src/lib/feature-flags";
import type { FeaturePresentationState } from "../../src/lib/effective-entitlement";

function Fixture() {
  const [state, setState] = useState<FeaturePresentationState>("LOCKED");
  const [music, setMusic] = useState(false);
  const [allowed, setAllowed] = useState(true);
  return <main className="mx-auto max-w-[1440px] space-y-4 p-4">
    <p>合成課程設定驗收；沒有登入、資料庫或通知。</p>
    <div className="flex flex-wrap gap-3">
      <label>功能狀態<select aria-label="功能狀態" className="min-h-11 border px-3" value={state} onChange={e => setState(e.target.value as FeaturePresentationState)}>
        <option>HIDDEN</option><option>LOCKED</option><option>ENABLED</option>
      </select></label>
      <label><input aria-label="音樂模組" type="checkbox" checked={music} onChange={e => setMusic(e.target.checked)} />音樂模組</label>
      <label><input aria-label="目的頁權限" type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} />目的頁權限</label>
    </div>
    <FeaturePresentationProvider states={{ [FEATURES.LINE_REMINDER]: state, [FEATURES.REFERRAL_SHARE]: state, [FEATURES.DIGITAL_BUTLER]: state }}>
      <CourseSettingsWorkspace storeId="synthetic-store" name="運動與音樂課程設定合成測試店" planLabel="合成方案"
        address="" mapUrl="" lineOfficialUrl="" bankName="" bankCode="" bankAccountNumber=""
        bookingLeadMinutes={10} cancellationLeadMinutes={30} music={music}
        canEdit={false} canPayment={false} canStaff={false} canPlans={false}
        canReminders={allowed} canReferralShare={allowed} canDigitalButler={allowed}
        panelContent={<label className="block p-6">未儲存草稿<input aria-label="未儲存草稿" className="min-h-11 max-w-full border px-3" defaultValue="草稿" /></label>} />
    </FeaturePresentationProvider>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
