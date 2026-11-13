import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>{
 let resolveHealth!:()=>void;
 const healthReady=new Promise<void>(resolve=>{resolveHealth=resolve;});
 return {component:()=>null,previewLink:()=>null,healthWorkspace:()=>null,healthReady,resolveHealth};
});
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace',()=>({CourseMemberWorkspace:m.component}));
vi.mock('@/components/frontend-preview/quick-link',()=>({FrontendPreviewQuickLink:m.previewLink}));
vi.mock('@/components/course-health-workspace',async()=>{await m.healthReady;return {CourseHealthWorkspace:m.healthWorkspace};});
import {courseMemberWorkspaceCode} from '@/app/(dashboard)/dashboard/courses/member-workspace-entry';
it('waits for the actual component and first-render shared dependencies before declaring code ready',async()=>{
 expect(courseMemberWorkspaceCode.get()).toBe(false);
 const preparing=courseMemberWorkspaceCode.read();await Promise.resolve();
 expect(courseMemberWorkspaceCode.get()).toBe(false);
 m.resolveHealth();
 expect(await preparing).toEqual({component:m.component,previewLink:m.previewLink,healthWorkspace:m.healthWorkspace});
 expect(courseMemberWorkspaceCode.get()).toBe(true);
});
