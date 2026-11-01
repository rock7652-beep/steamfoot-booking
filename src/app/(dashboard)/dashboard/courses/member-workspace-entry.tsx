"use client";

import dynamic from "next/dynamic";

// Keep server rendering on the member routes, but do not pull their client
// workspace into the schedule route's initial scripts through the shared page.
export const CourseMemberWorkspaceEntry = dynamic(() =>
  import("./member-workspace").then(module => module.CourseMemberWorkspace),
);
