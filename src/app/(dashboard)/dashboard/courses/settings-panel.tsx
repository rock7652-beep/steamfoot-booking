"use client";
import type {ReactNode} from "react";
import {SettingsPanel} from "@/components/settings/settings-panel";
import {COURSE_SETTINGS_PANELS,type CourseSettingsPanel as PanelName} from "@/lib/course-settings-panels";
/** Course business content uses the same container and dirty guard as steam settings. */
export function CourseSettingsPanel({panel,children,navigate,closeHref,onSaved}:{panel:PanelName;children:ReactNode;navigate?:(href:string)=>void;closeHref?:string;onSaved?:()=>void}){
 const config=COURSE_SETTINGS_PANELS[panel];
 return <div data-course-settings-panel><SettingsPanel title={config.title} sourceHref={config.href} navigateLocal={navigate} closeTarget={closeHref} onSaved={onSaved}>{children}</SettingsPanel></div>;
}
