import {expect,it} from 'vitest';
import {brandOperationSchema} from '@/server/ai/brand-management-contract';
import {BRAND_PREVIEW_WRITE_OPERATIONS,brandPreviewWriteWindow} from '../../scripts/ai-brand-preview-write-window.mjs';
const now=new Date('2026-11-26T14:00:00Z');
const base={AI_BRAND_PREVIEW_WRITE_OPERATIONS:'save,publish,withdraw,setting,handoff,resume,test',AI_BRAND_PREVIEW_WRITE_UNTIL:'2026-11-26T14:30:00Z'};
it('requires explicit operations and a bounded future deadline',()=>{expect(brandPreviewWriteWindow({},now)).toMatchObject({configured:false,valid:false});expect(brandPreviewWriteWindow(base,now).valid).toBe(true);});
it.each([{AI_BRAND_PREVIEW_WRITE_OPERATIONS:'save,openai'},{AI_BRAND_PREVIEW_WRITE_OPERATIONS:'save,save'},{AI_BRAND_PREVIEW_WRITE_OPERATIONS:''},{AI_BRAND_PREVIEW_WRITE_OPERATIONS:'save, publish'},{AI_BRAND_PREVIEW_WRITE_UNTIL:'2026-11-26T14:30:00.001Z'},{AI_BRAND_PREVIEW_WRITE_UNTIL:'2026-11-26T14:00:00Z'},{AI_BRAND_PREVIEW_WRITE_UNTIL:undefined}])('fails closed on malformed or expired write approval %j',extra=>{expect(brandPreviewWriteWindow({...base,...extra},now).valid).toBe(false);});

it('build and management permit exactly the same operations',()=>{expect(BRAND_PREVIEW_WRITE_OPERATIONS).toEqual(brandOperationSchema.options);});
