// Actual home and booking card with synthetic data. All actions/network blocked by the runner.
import {createRoot} from 'react-dom/client';
import {WelcomeBack,type MemberHomeSummary} from '@/app/(liff)/liff/liff-shell';
import {BookingCard} from '@/app/(liff)/liff/bookings/_components/booking-card';
const value=new URLSearchParams(location.search).get('people')??'3';
const people=Number(value);
const nextBooking=value==='none'?null:{id:'synthetic-next',bookingDate:'2026-11-25',slotTime:'15:00',bookingStatus:'PENDING',bookingType:'PACKAGE_SESSION',isMakeup:false,people};
const later={id:'synthetic-later',bookingDate:'2026-11-30',slotTime:'16:00',bookingStatus:'PENDING',bookingType:'PACKAGE_SESSION',isMakeup:false,people:9};
const wallet={id:'synthetic',planName:'蒸足方案',planCategory:'PACKAGE',totalSessions:30,remainingSessions:23,availableToBook:20,pendingCount:3,usedCount:7,voidedCount:0,startDate:'2026-08-27',expiryDate:'2027-08-27',status:'ACTIVE'};
const memberSummary:MemberHomeSummary={walletsStatus:'ok',activeWallets:[wallet],makeupCredits:[],upcomingBookings:nextBooking?[nextBooking,later]:[],nextBooking,healthSummary:null,referralShare:null};
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-md p-4"><p>隔離預覽・合成資料</p><WelcomeBack storeSlug="synthetic" displayName="合成會員" memberSummary={memberSummary} healthAssessmentEnabled={false} compactHome announcementItems={[]} previewAnnouncements/>{nextBooking&&<section data-test="booking"><h2>預約詳情對照</h2><BookingCard booking={nextBooking} tab="upcoming" storeName="合成門市" contactUrl="" storeAddress="" storeMapUrl=""/></section>}</main>);
