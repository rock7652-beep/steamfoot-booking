import { describe,it,expect } from "vitest";
import { settlementPlan,type SettlementInput } from "./inventory-settlement";
import { inventoryReport,type InventoryLine,type InventoryOrderView, lineTotal } from "./inventory";
const line:InventoryLine={productId:"a",name:"折扣商品",quantity:3,unitPrice:100,discountMode:"AMOUNT",discount:50,gift:false,total:250,cost:120};
const input=(override:Partial<SettlementInput>={}):SettlementInput=>({requestId:"r",orderId:"o",revision:1,kind:"RETURN",date:"2026-10-07",reason:"退貨",method:"現金",refund:0,freight:0,exchangeOrderId:"",lines:[{productId:"a",quantity:1,restock:true}],...override});
describe("inventory settlement amounts",()=>{
 it("returns only discounted transaction amounts, with exact final rounding",()=>{
  const first=settlementPlan([line],0,250,input());expect(first.total).toBe(167);expect(first.maximumRefund).toBe(83);expect(lineTotal(first.lines[0])).toBe(first.lines[0].total);expect(lineTotal(first.returned[0])).toBe(first.returned[0].total);
  const second=settlementPlan(first.lines,0,250,input({lines:[{productId:"a",quantity:2,restock:true}]}));expect(second.total).toBe(0);expect(first.returned[0].total+second.returned[0].total).toBe(250);
 });
 it("unpaid returns reduce debt without inventing a refund",()=>{const p=settlementPlan([line],0,0,input());expect(p.remaining).toBe(167);expect(p.maximumRefund).toBe(0);expect(()=>settlementPlan([line],0,0,input({refund:1}))).toThrow("退款不可");});
 it("partial payments keep retained goods covered before refunding",()=>{const p=settlementPlan([line],0,100,input());expect(p.remaining).toBe(67);expect(p.maximumRefund).toBe(0);});
 it("allows deferred refund and subsequent partial payouts",()=>{const p=settlementPlan([line],0,250,input());expect(p.pendingRefund).toBe(83);const paid=settlementPlan(p.lines,0,p.paid,input({kind:"REFUND",lines:[],refund:30}));expect(paid.pendingRefund).toBe(53);});
 it("does not auto refund freight and rejects excessive freight",()=>{const p=settlementPlan([line],80,330,input({lines:[{productId:"a",quantity:3,restock:false}],refund:250}));expect(p.total).toBe(80);expect(p.pendingRefund).toBe(0);expect(()=>settlementPlan([line],80,330,input({freight:81}))).toThrow("運費");});
 it("gifts affect quantity but no refund",()=>{const p=settlementPlan([{...line,gift:true,total:0}],0,0,input());expect(p.returned[0].total).toBe(0);expect(p.maximumRefund).toBe(0);});
 it("rejects duplicate, excess, unknown lines and incomplete voids",()=>{expect(()=>settlementPlan([line],0,250,input({lines:[...input().lines,...input().lines]}))).toThrow("重複");expect(()=>settlementPlan([line],0,250,input({lines:[{productId:"a",quantity:4,restock:true}]}))).toThrow("數量");expect(()=>settlementPlan([line],0,250,input({lines:[{productId:"wrong",quantity:1,restock:true}]}))).toThrow("找不到");expect(()=>settlementPlan([line],0,250,input({kind:"VOID"}))).toThrow("全部");});
 it("attributes returns to their actual date and preserves original sale",()=>{
  const p=settlementPlan([line],0,250,input());const order={id:"o",kind:"SALE",date:"2026-09-30",lines:p.lines,settlements:[{...input(),actorName:"店長",returned:p.returned,originalLines:[line],originalFreight:0,restock:input().lines}]} as unknown as InventoryOrderView;
  expect(inventoryReport([order],"2026-09-01","2026-09-30")[0].total).toBe(250);
  expect(inventoryReport([order],"2026-10-01","2026-10-31")[0].total).toBe(-83);
  expect(inventoryReport([order],"2026-09-01","2026-10-31")[0].total).toBe(167);
 });
 it("damaged returns reduce revenue but keep their consumed cost",()=>{const p=settlementPlan([line],0,250,input({lines:[{productId:"a",quantity:1,restock:false}]}));const order={kind:"SALE",date:"2026-10-01",lines:p.lines,settlements:[{...input(),returned:p.returned,originalLines:[line],restock:[{productId:"a",quantity:1,restock:false}]}]} as unknown as InventoryOrderView;expect(inventoryReport([order],"2026-10-01","2026-10-31")[0].cost).toBe(120);});
});
