// Actual settings UI with synthetic data. No auth, database, or production writes.
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { CourseSettingsWorkspace } from "../../src/app/(dashboard)/dashboard/courses/settings-workspace";
import { FeaturePresentationProvider } from "../../src/components/feature-presentation";
import { FEATURES } from "../../src/lib/feature-flags";

createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-[1440px] p-4">
  <p className="mb-4 text-sm">YoungSky 設定流程隔離預覽：合成資料及模擬回覆，非正式站效能。</p>
  <FeaturePresentationProvider states={{ [FEATURES.COURSE_WAITLIST]: "ENABLED" }}>
    <CourseSettingsWorkspace storeId="synthetic-youngsky" name="YoungSky 合成測試店"
      planLabel="合成方案" address="" mapUrl="" lineOfficialUrl="" shopPhone="" lineOfficialId=""
      bankName="" bankCode="" bankAccountNumber="" bookingLeadMinutes={60} cancellationLeadMinutes={120}
      canEdit canPayment canStaff={false} canPlans={false} canTrial waitlistFeatureAvailable
      waitlistSettings={{enabled:true,defaultLimit:3,autoPromoteStopMinutes:240}}
      trialSettings={{trialEnabled:true,trialDefaultPrice:300,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000}}
    />
  </FeaturePresentationProvider><Toaster />
</main>);
