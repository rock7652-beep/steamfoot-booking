import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({component:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace',()=>({CourseMemberWorkspace:m.component}));
import {courseMemberWorkspaceCode} from '@/app/(dashboard)/dashboard/courses/member-workspace-entry';
it('prepares the actual component export and its dependencies before declaring its code ready',async()=>{
 expect(courseMemberWorkspaceCode.get()).toBe(false);
 expect(await courseMemberWorkspaceCode.read()).toBe(m.component);
 expect(courseMemberWorkspaceCode.get()).toBe(true);
});
