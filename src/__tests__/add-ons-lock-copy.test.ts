import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/admin/modal-panel',()=>({ModalPanel:({children}:{children:import('react').ReactNode})=>children}));
import {UpgradePrompt} from '@/components/feature-gate';
it('shows independent HQ activation instead of promising a pricing-plan upgrade will unlock add-ons',()=>{
 const html=renderToStaticMarkup(createElement(UpgradePrompt,{open:true,onClose:()=>{},targetPlan:'BASIC',featureLabel:'附加項目',feature:'add_ons'}));
 expect(html).toContain('請聯絡總部確認開通');expect(html).toContain('既有預約與款項紀錄保留');
 expect(html).not.toContain('/pricing');expect(html).not.toContain('立即升級');
});
