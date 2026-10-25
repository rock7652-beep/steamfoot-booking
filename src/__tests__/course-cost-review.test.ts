import {expect,it} from 'vitest';
import {courseFeeCostVersion,courseCostReviewerRole,purchaseCostReview} from '@/lib/course-cost-review';
const plan={id:'p',name:'課程',price:600,storeCost:200,points:1,unit:'SESSION',isActive:true,chargeSettings:null};
const snapshot={version:1,planId:'p',storeCost:200,basePrice:600,quotedPrice:600,basePoints:1,purchasedPoints:1};
it('invalidates confirmation after financial edits while retaining explicit zero',()=>{
 expect(courseFeeCostVersion({...plan,storeCost:0})).not.toBe(courseFeeCostVersion(plan));
 expect(courseFeeCostVersion({...plan,price:601})).not.toBe(courseFeeCostVersion(plan));
 expect(JSON.parse(courseFeeCostVersion({...plan,storeCost:0})).storeCost).toBe(0);
});
it('does not use revenue allocation or today catalog values to fill old costs',()=>{
 expect(purchaseCostReview({received:600,refunds:0,snapshot:{storeCostSnapshot:200}})).toMatchObject({cost:null,difference:null});
 expect(purchaseCostReview({received:600,refunds:0,snapshot})).toMatchObject({cost:200,difference:400,issue:null});
});
it('excludes refunds, unpaid purchases and changed periods rather than guessing a cost allocation',()=>{
 expect(purchaseCostReview({received:600,refunds:100,snapshot}).difference).toBeNull();
 expect(purchaseCostReview({received:300,refunds:0,due:600,snapshot}).difference).toBeNull();
 expect(purchaseCostReview({received:1200,refunds:0,snapshot:{...snapshot,quotedPrice:1200,purchasedPoints:2}})).toMatchObject({cost:null,difference:null});
});
it('only counts zero cost after an explicit confirmation and preserves a real loss',()=>{
 expect(purchaseCostReview({received:600,refunds:0,snapshot:{...snapshot,storeCost:0}}).difference).toBeNull();
 expect(purchaseCostReview({received:600,refunds:0,zeroConfirmed:true,snapshot:{...snapshot,storeCost:0}}).difference).toBe(600);
 expect(purchaseCostReview({received:0,refunds:0,snapshot}).difference).toBe(-200);
});
it('restricts whole-store cost review to managers with the owner/admin role',()=>{
 expect(courseCostReviewerRole('OWNER')).toBe(true);expect(courseCostReviewerRole('ADMIN')).toBe(true);
 for(const role of ['STAFF','COACH','CUSTOMER'])expect(courseCostReviewerRole(role)).toBe(false);
});
