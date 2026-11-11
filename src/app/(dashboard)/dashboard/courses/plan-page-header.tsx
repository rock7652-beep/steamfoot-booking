import {PageHeader} from "@/components/desktop/page-header";
import {DashboardLink} from "@/components/dashboard-link";

/** Keep fee navigation in the page header, without a second workspace title. */
export function CoursePlanPageHeader({nativeFees}:{nativeFees:boolean}) {
  return <div className={nativeFees?"[&>[data-page-header]]:flex-row [&>[data-page-header]]:flex-wrap [&>[data-page-header]]:items-center [&>[data-page-header]]:justify-between":undefined}>
    <PageHeader compact={nativeFees} title={nativeFees?"收費方式":"方案管理"} actions={nativeFees?
      <DashboardLink href="/dashboard/courses?view=catalog" className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 py-2 text-sm">返回教學項目</DashboardLink>:undefined}/>
  </div>;
}
