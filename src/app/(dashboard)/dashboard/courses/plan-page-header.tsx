import {PageHeader} from "@/components/desktop/page-header";

/** The sidebar owns navigation; the page header only identifies the current list. */
export function CoursePlanPageHeader({nativeFees}:{nativeFees:boolean}) {
  return <div className={nativeFees?"[&>[data-page-header]]:flex-row [&>[data-page-header]]:flex-wrap [&>[data-page-header]]:items-center [&>[data-page-header]]:justify-between":undefined}>
    <PageHeader compact={nativeFees} title={nativeFees?"收費方式":"方案管理"}/>
  </div>;
}
