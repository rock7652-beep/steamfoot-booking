"use client";

import dynamic from "next/dynamic";

// Capture the same literal loader used by next/dynamic. Production compilers can
// give a separate import callsite a different namespace chunk even for one file.
let loadWorkspace!:()=>Promise<typeof import("./member-workspace")["CourseMemberWorkspace"]>;
export const CourseMemberWorkspaceEntry = dynamic({
 loader: loadWorkspace = () => import("./member-workspace").then(module => module.CourseMemberWorkspace),
});

// Only public JavaScript assets are retained here; no customer or permission data.
let workspaceCodeReady=false;
export const courseMemberWorkspaceCode={
 async read(){
  // The production loader resolves these shared bindings on first render.
  // Prepare their public modules too, without mounting them or reading data.
  const [component,previewLink,healthWorkspace]=await Promise.all([
   loadWorkspace(),
   import("@/components/frontend-preview/quick-link").then(module=>module.FrontendPreviewQuickLink),
   import("@/components/course-health-workspace").then(module=>module.CourseHealthWorkspace),
  ]);
  workspaceCodeReady=true;return {component,previewLink,healthWorkspace};
 },
 get(){return workspaceCodeReady;},
};
