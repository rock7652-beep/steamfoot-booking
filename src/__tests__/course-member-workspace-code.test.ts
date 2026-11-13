// @vitest-environment jsdom
import {act,createElement,type ComponentType} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>{
 let resolveHealth!:()=>void;
 const healthReady=new Promise<void>(resolve=>{resolveHealth=resolve;});
 return {component:()=>createElement("div",null,"workspace ready"),previewLink:()=>null,healthWorkspace:()=>null,healthReady,resolveHealth};
});
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace',()=>({CourseMemberWorkspace:m.component}));
vi.mock('@/components/frontend-preview/quick-link',()=>({FrontendPreviewQuickLink:m.previewLink}));
vi.mock('@/components/course-health-workspace',async()=>{await m.healthReady;return {CourseHealthWorkspace:m.healthWorkspace};});
vi.mock('next/dynamic',async()=>({default:(await vi.importActual<typeof import('next/dist/shared/lib/app-dynamic')>('next/dist/shared/lib/app-dynamic')).default}));
import {CourseMemberWorkspaceEntry,courseMemberWorkspaceCode} from '@/app/(dashboard)/dashboard/courses/member-workspace-entry';
it('waits for the actual component and first-render shared dependencies before declaring code ready',async()=>{
 expect(courseMemberWorkspaceCode.get()).toBe(false);
 const preparing=courseMemberWorkspaceCode.read();await Promise.resolve();
 expect(courseMemberWorkspaceCode.get()).toBe(false);
 m.resolveHealth();
 expect(await preparing).toEqual({component:m.component,previewLink:m.previewLink,healthWorkspace:m.healthWorkspace});
 expect(courseMemberWorkspaceCode.get()).toBe(true);
});

it('renders through the actual App Router dynamic entry after preparing its code',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 try{
  await courseMemberWorkspaceCode.read();
  await act(async()=>{root.render(createElement(CourseMemberWorkspaceEntry as ComponentType));});
  expect(host.textContent).toBe('workspace ready');
 }finally{await act(async()=>root.unmount());}
});
