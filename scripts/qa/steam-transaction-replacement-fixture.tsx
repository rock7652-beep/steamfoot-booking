// Synthetic data only; server actions are replaced by the browser harness.
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TransactionDrawer } from '../../src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer';
import { PanelReadProvider } from '../../src/components/operations/panel-read-cache';
createRoot(document.getElementById('root')!).render(<PanelReadProvider><main className="p-4"><h1>取消後補登收費・合成操作預覽</h1></main><TransactionDrawer open onClose={()=>{}} transactionId="synthetic-original" staffOptions={[]} canVoid canEdit canRefund/><Toaster/></PanelReadProvider>);
