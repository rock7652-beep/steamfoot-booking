"use client";

import dynamic from "next/dynamic";

// Keep server rendering on the member routes, but do not pull their client
// workspace into the schedule route's initial scripts through the shared page.
export const CourseMemberWorkspaceEntry = dynamic(() =>
  import("./member-workspace").then(module => module.CourseMemberWorkspace),
);

// Only public JavaScript assets are retained here; no customer or permission data.
let workspaceCodeReady=false;
export const courseMemberWorkspaceCode={
 async read(){const component=await import("./member-workspace").then(module=>module.CourseMemberWorkspace);workspaceCodeReady=true;return component;},
 get(){return workspaceCodeReady;},
};
