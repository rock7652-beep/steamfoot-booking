"use client";

import dynamic from "next/dynamic";
import {FrontendPreviewQuickLink} from "@/components/frontend-preview/quick-link";

// Keep server rendering on the member routes, but do not pull their client
// workspace into the schedule route's initial scripts through the shared page.
export const CourseMemberWorkspaceEntry = dynamic(() =>
  import("./member-workspace").then(module => module.CourseMemberWorkspace),
);

// Only public JavaScript assets are retained here; no customer or permission data.
let workspaceCodeReady=false;
export const courseMemberWorkspaceCode={
 async read(){
  // The production loader resolves these shared bindings on first render.
  // Prepare their public modules too, without mounting them or reading data.
  const [component,healthWorkspace]=await Promise.all([
   import("./member-workspace").then(module=>module.CourseMemberWorkspace),
   import("@/components/course-health-workspace").then(module=>module.CourseHealthWorkspace),
  ]);
  workspaceCodeReady=true;return {component,previewLink:FrontendPreviewQuickLink,healthWorkspace};
 },
 get(){return workspaceCodeReady;},
};
