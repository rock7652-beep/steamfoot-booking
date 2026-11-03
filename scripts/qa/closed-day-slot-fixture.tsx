// Synthetic UI preview. Uses the actual manager with isolated in-memory actions.
import {createRoot} from 'react-dom/client';
import {DaySlotManager} from '../../src/app/(dashboard)/dashboard/bookings/day-slot-manager';
import {Toaster} from 'sonner';
import '../../src/app/globals.css';
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-earth-50 p-4"><h1 className="mb-4 text-base font-semibold">蒸足預約管理｜公休日</h1><DaySlotManager date="2026-11-03" bookedPeopleBySlot={new Map()} onSaved={()=>{const w=window as typeof window & {__savedRefreshCount?:number};w.__savedRefreshCount=(w.__savedRefreshCount??0)+1;}}/><Toaster/></main>);
