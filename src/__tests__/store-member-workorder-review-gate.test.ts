import { describe, expect, it } from "vitest";
import { assertStoreMemberWorkorderReviewOnly, STORE_MEMBER_WORKORDER_REVIEW_BRANCH } from "../../scripts/store-member-workorder-review-gate.mjs";
describe("unapproved schema-dependent review release",()=>{
  it.each(["VERCEL_GIT_COMMIT_REF","CF_PAGES_BRANCH","WORKERS_CI_BRANCH"])("blocks %s even when another provider claims main",key=>{expect(()=>assertStoreMemberWorkorderReviewOnly({NODE_ENV:"test",VERCEL_GIT_COMMIT_REF:"main",[key]:STORE_MEMBER_WORKORDER_REVIEW_BRANCH})).toThrow(/disabled/);});
  it("does not change other branches or local unit-test execution",()=>{expect(()=>assertStoreMemberWorkorderReviewOnly({NODE_ENV:"test",VERCEL_GIT_COMMIT_REF:"main"})).not.toThrow();expect(()=>assertStoreMemberWorkorderReviewOnly({NODE_ENV:"test"})).not.toThrow();});
});
