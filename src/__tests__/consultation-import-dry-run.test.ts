import { describe,it,expect } from "vitest";
import { reviewConsultationImport } from "../../scripts/consultation-import-dry-run";
const payload={requestId:"f2170225-17f8-4ad7-8031-f305afba256f",storeName:"虛構店",contactName:"測試",industry:"服務",phone:"0000000000",needs:["預約"],replaceReason:[]};
const row={sourceRow:2,createdAt:"2026-10-07T15:24:45Z",payload};
describe("historical consultation review only",()=>{
 it("validates source row/time/id without pretending a database duplicate check or import happened",()=>expect(reviewConsultationImport([row])).toMatchObject({valid:true,rows:1,applySupported:false,databaseDuplicatesChecked:false}));
 it("identifies same-id duplicates and conflicts",()=>{
 expect(reviewConsultationImport([row,row])).toMatchObject({valid:true,duplicateRequestIds:1});
 expect(reviewConsultationImport([row,{...row,payload:{...payload,storeName:"另一虛構店"}}])).toMatchObject({valid:false,conflictingRequestIds:1});
 });
 it("requires existing request identity and explicit timezone; never manufactures either",()=>{
 expect(reviewConsultationImport([{...row,payload:{...payload,requestId:undefined}}])).toMatchObject({valid:false});
 expect(reviewConsultationImport([{...row,createdAt:"2026/10/7 下午 3:24:45"}])).toMatchObject({valid:false});
 });
});
