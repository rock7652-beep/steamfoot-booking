import type {FrontendPreviewSelection} from '@/server/services/frontend-preview';
import type {readBeautyCardHistory,readBeautyOwnIncome,readBeautyWorkRecords} from '@/lib/beauty/portal-detail-read';
import type {readBeautySlots} from '@/server/actions/beauty';
import type {loadCourseHealth} from '@/server/actions/course-health';
export type BeautyPreviewSource={
 selection:FrontendPreviewSelection;memberId:string|null;technicianId:string|null;
 history:typeof readBeautyCardHistory;income:typeof readBeautyOwnIncome;records:typeof readBeautyWorkRecords;
 slots:typeof readBeautySlots;health:()=>ReturnType<typeof loadCourseHealth>;
};
