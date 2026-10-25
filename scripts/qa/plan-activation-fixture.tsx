import {createRoot} from 'react-dom/client';
import {PlanActivationNotificationSetting} from '../../src/components/admin/plan-activation-notification-setting';
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl space-y-3 p-4 text-earth-900"><h1 className="text-xl font-semibold">{params.get('module')}・提醒管理 → 顧客提醒 → 方案提醒</h1><p>隔離共用元件預覽；示範資料，不連線後台、不發 LINE。</p><div style={{maxWidth:params.get('narrow')?'360px':undefined}}><PlanActivationNotificationSetting storeId="qa-store" initialEnabled={false} readOnly={params.has('readonly')}/></div></main>);
