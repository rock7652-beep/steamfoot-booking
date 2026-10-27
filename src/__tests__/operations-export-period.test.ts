import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import DataExportClient from '@/app/(dashboard)/dashboard/data-export/data-export-client';
it('shows the selected operational period in the export form instead of resetting it to this month',()=>{
 const html=renderToStaticMarkup(h(DataExportClient,{isAdmin:false,stores:[],activeStoreId:'store',canCustomerExport:false,canReportExport:true,initialStartDate:'2026-08-01',initialEndDate:'2026-08-31'}));
 expect(html).toContain('value="2026-08-01"');expect(html).toContain('value="2026-08-31"');expect(html).not.toContain('顧客資料</option>');
});
