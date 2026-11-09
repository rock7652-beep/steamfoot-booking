"use client";

import dynamic from 'next/dynamic';

// These routes still server-render their own views. The schedule never renders
// these entries, so settings, analytics and showcase code can stay separate.
export const BusinessAnalyticsViewEntry=dynamic(()=>import('./business-analytics-view').then(module=>module.BusinessAnalyticsView));
export const CourseSettingsWorkspaceEntry=dynamic(()=>import('./settings-workspace').then(module=>module.CourseSettingsWorkspace));
export const MusicTypesShowcaseEntry=dynamic(()=>import('./showcase/music-types-showcase').then(module=>module.MusicTypesShowcase));
