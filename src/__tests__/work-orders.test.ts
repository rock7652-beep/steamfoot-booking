import { describe, expect, it } from "vitest";
import { LABOR_PRODUCT_ID, workOrderSchema, workOrderPaymentLabel } from "@/lib/work-orders";
describe("work-order input and payment state",()=>{
 const input={requestId:"ad7e6f88-5c5b-4b85-a642-6339d91f7c69",date:"2026-10-06",partyId:"customer",details:{item:"吉他調整"}};
 it("defaults to a zero labor quote in progress without product lines",()=>{const v=workOrderSchema.parse(input);expect(v.labor).toBe(0);expect(v.lines).toEqual([]);expect(v.details.status).toBe("PROCESSING");});
 it("has no artificial shop labor fee ceiling",()=>{expect(workOrderSchema.parse({...input,labor:100000001}).labor).toBe(100000001);});
 it("rejects fractional, negative and unrepresentable money",()=>{for(const labor of [1.1,-1,Infinity,2147483648])expect(workOrderSchema.safeParse({...input,labor}).success).toBe(false);});
 it("cannot inject the reserved labor item as a stocked product",()=>{expect(workOrderSchema.safeParse({...input,lines:[{productId:LABOR_PRODUCT_ID,quantity:1,unitPrice:0,discountMode:"NONE",discount:0,gift:false}]}).success).toBe(false);});
 it("zero quoted fees remain unpaid until a free job is collected",()=>{const workOrder=workOrderSchema.parse(input).details;expect(workOrderPaymentLabel({total:0,paid:0,workOrder})).toBe("未付款");expect(workOrderPaymentLabel({total:0,paid:0,workOrder:{...workOrder,status:"COLLECTED"}})).toBe("免收費");});
 it("progress does not imply payment",()=>{const workOrder={...workOrderSchema.parse(input).details,status:"COLLECTED" as const};expect(workOrderPaymentLabel({total:800,paid:0,workOrder})).toBe("未付款");expect(workOrderPaymentLabel({total:800,paid:200,workOrder})).toBe("部分付款");expect(workOrderPaymentLabel({total:800,paid:800,workOrder})).toBe("已付清");});
});
