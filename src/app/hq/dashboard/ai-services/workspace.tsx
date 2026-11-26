"use client";
import { SettingsModuleWorkspace, SettingsListRow } from "@/components/settings/settings-workspace";
import { FeatureStateEntry } from "@/components/feature-presentation";
import { AiButlerPanel } from "@/app/(dashboard)/dashboard/settings/digital-butler/ai-panel";
import { AiKnowledgePanel } from "@/app/(dashboard)/dashboard/settings/digital-butler/ai-knowledge-panel";
import { AiHandoffPanel } from "@/app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-panel";
import { AiHandoffWorkspace } from "@/app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-workspace";
import type { BrandManagementSnapshot } from "@/server/ai/brand-management-contract";
import { readBrandKnowledge, reviewBrandKnowledge, changeBrandKnowledge, saveBrandSetting, testBrandScenario, setBrandHandoff, testBrandKnowledge, readBrandHandoffs, resumeBrandConversation } from "./actions";

const panelActions={saveAiButlerSetting:saveBrandSetting,testAiButler:({eventId,scenario,provider}:Parameters<typeof testBrandScenario>[0])=>testBrandScenario({eventId,scenario,provider}),setAiButlerTestHandoff:setBrandHandoff};
const knowledgeActions={readAiButlerKnowledge:readBrandKnowledge,changeAiButlerKnowledge:changeBrandKnowledge,testAiButlerPublished:testBrandKnowledge,setAiButlerTestHandoff:setBrandHandoff,reviewKnowledge:reviewBrandKnowledge};
const handoffActions={readAiButlerHandoffs:readBrandHandoffs,resumeAiButlerConversation:resumeBrandConversation};
export function BrandAiWorkspace({snapshot:s}:{snapshot:BrandManagementSnapshot}) {
  const states={HIDDEN:"隱藏：一般服務入口不顯示",LOCKED:"鎖定：顯示入口但不可使用",ENABLED:"已開通：仍需操作權限與開關"};
  return <AiHandoffWorkspace key={s.viewKey} viewKey={s.viewKey}>
    <div className="min-w-0 space-y-4 [&_nav_button]:min-h-11">
      <div className="min-w-0 rounded-xl border border-earth-200 bg-white p-4 text-sm">
        <p className="font-medium">品牌獨立服務・隔離 Preview</p>
        <p className="mt-2 break-words text-earth-600">目前為 HQ 授權與配置核對；不代表客服入口已開放。品牌與門市的知識、對話、用量及操作權限分開。</p>
        <p className="mt-2 break-words" role="status">HQ 授權：{states[s.grant]}・AI 總停止：{s.globalStopped?"停止":"運作中"}・品牌開關：{s.setting.enabled?"開啟":"關閉"}</p>
        {!Object.values(s.capabilities).some(Boolean)&&<p className="mt-2 text-earth-600">本輪唯讀，資料異動、發布、啟用與測試請求尚未授權。</p>}
        <FeatureStateEntry state={s.effectiveGrant} label="品牌智慧客服"><p className="mt-2">服務資格已開通；實際回覆仍受總停止、品牌開關與測試窗口限制。</p></FeatureStateEntry>
      </div>
      <SettingsModuleWorkspace moduleLabel="品牌 AI 智慧客服" storeName={s.name} sections={[
        {id:"overview",label:"狀態與用量",content:<AiButlerPanel serviceMode="BRAND" actions={panelActions} setting={s.setting} revision={s.revision} liveTestAvailable={false}
          requestCount={s.usage.requests} reservedMicros={s.usage.reservedMicros} budgetMicros={s.usage.budgetMicros} alerts={s.usage.alerts} initialHandoff={s.synthetic.handoff} initialHandoffRevision={s.synthetic.revision}
          canToggle={s.capabilities.setting} canTest={s.capabilities.test} canHandoff={s.capabilities.handoff} globalStopped={s.globalStopped}/>},
        {id:"knowledge",label:"品牌知識",content:<AiKnowledgePanel serviceMode="BRAND" initial={s.document} liveTestAvailable={false} actions={knowledgeActions} capabilities={s.capabilities}/>},
        {id:"handoff",label:"人工接手",content:<AiHandoffPanel serviceMode="BRAND" page={s.handoffs} viewKey={s.viewKey} readOnly={!s.capabilities.resume} actions={handoffActions}/>},
        {id:"authorization",label:"授權與安全",content:<div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
          <SettingsListRow title="HQ 三態授權" summary={states[s.grant]}/>
          <SettingsListRow title="營運工具" summary="品牌不使用門市營運工具"/>
          <SettingsListRow title="對外訊息" summary="真實 LINE、Messenger、Email 外發封鎖"/>
          <SettingsListRow title="知識發布" summary="需儲存、審核相同版本及明確發布授權"/>
          <p className="pb-4 text-sm text-earth-600">此處只核對授權，不會改變 HQ 狀態、總停止或原有額度。授權變更需由既有 HQ 管理程序另行核准。</p>
        </div>},
      ]}/>
    </div>
  </AiHandoffWorkspace>;
}
