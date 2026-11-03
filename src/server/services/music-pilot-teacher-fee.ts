import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/course-client";
import { musicOpeningMakeupHash } from "@/lib/music-opening-makeup";
import { assertMusicOpeningPreviewEnvironment } from "../../../scripts/music-opening-preview-scope.mjs";
import { PILOT_EVIDENCE_HASH, PILOT_RECEIPT_ID } from "./music-pilot-policy";
export const PILOT_FEE_ID="d82dda62-db1a-ac2b-7036-c592cfccb4c4";
export const PILOT_FEE_HASH="d82dda62db1aac2b7036c592cfccb4c4362ef730db5492e38700149fc1ab362a";
const basis=z.object({customerId:z.string(),cardId:z.string(),templateId:z.string(),originalUnitPrice:z.number().int().nonnegative()});
const proofSchema=z.object({version:z.literal(1),operationalHash:z.literal(PILOT_EVIDENCE_HASH),teachers:z.array(z.object({staffId:z.string(),percent:z.number().min(0).max(100)})),enrollments:z.array(basis),trial:z.object({customerId:z.string(),templateId:z.string(),base:z.number().int().nonnegative()}),oldMakeup:z.object({id:z.string(),contentHash:z.string(),customerId:z.string(),templateId:z.string(),originalUnitPrice:z.number().int().nonnegative()}),policy:z.object({discount:z.literal("ORIGINAL_PRICE"),freeTrial:z.literal("ORIGINAL_PRICE"),studentLeave:z.literal("PAY_ON_MAKEUP_ONLY"),noShow:z.literal("DEDUCT_AND_PAY"),makeup:z.literal("PAY_ON_ATTENDANCE")}),confirmedBusinessDate:z.string()});
export type PilotFeeProof=z.infer<typeof proofSchema>;
type Reader=Pick<Prisma.TransactionClient,"$queryRaw">;
/** An immutable source verification is effective only in the exact existing pilot. */
export async function readMusicPilotFeeProof(tx:Reader,storeId:string):Promise<PilotFeeProof|null>{
  if(storeId!=="store-lubymusic"||process.env.VERCEL!=="1")return null;
  try{assertMusicOpeningPreviewEnvironment(process.env);}catch{return null;}
  const rows=await tx.$queryRaw<Array<{payload:unknown;contentHash:string;receipt:unknown}>>`SELECT f.payload,f."contentHash",a."afterJson" AS receipt FROM "MusicSourceImportBatch" f JOIN "AuditLog" a ON a.id=${PILOT_RECEIPT_ID} AND a."storeId"=f."storeId" AND a.action='SOURCE_OPERATIONS_IMPORT' WHERE f.id=${PILOT_FEE_ID} AND f."storeId"=${storeId}`;
  if(!rows.length)return null;
  if(rows.length!==1||rows[0].contentHash!==PILOT_FEE_HASH||musicOpeningMakeupHash(rows[0].payload)!==PILOT_FEE_HASH)throw new Error("鐘點來源核對碼不一致");
  const proof=proofSchema.parse(rows[0].payload),receipt=z.object({contentHash:z.literal(PILOT_EVIDENCE_HASH),cardIds:z.array(z.string())}).parse(rows[0].receipt);
  if(proof.enrollments.length!==7||proof.enrollments.some(e=>!receipt.cardIds.includes(e.cardId)))throw new Error("鐘點來源與已匯入方案不一致");
  return proof;
}
export type PilotFeeRow={cardId:string|null;customerId:string|null;templateId:string;bookingKind:string;purchaseCount:bigint;cardRequestKey?:string|null;sourceCardId?:string|null;sourceCustomerId?:string|null;sourceStatus?:string|null;sourceAbsenceKind?:string|null;sourceTemplateId?:string|null;musicOpeningMakeupEntitlementId?:string|null;makeupContentHash?:string|null;makeupCustomerId?:string|null;makeupTemplateId?:string|null};
/** No prefix grants payroll authority: check the persisted ordinary card or makeup lineage. */
export function verifiedMusicPilotFeeBasis(proof:PilotFeeProof,row:PilotFeeRow){
  const direct=proof.enrollments.find(e=>e.cardId===row.cardId&&e.customerId===row.customerId&&e.templateId===row.templateId);
  if(direct&&Number(row.purchaseCount)===0&&row.cardRequestKey===direct.cardId)return {price:direct.originalUnitPrice,makeup:false};
  const source=proof.enrollments.find(e=>e.cardId===row.sourceCardId&&e.customerId===row.customerId&&e.customerId===row.sourceCustomerId&&e.templateId===row.templateId&&e.templateId===row.sourceTemplateId);
  if(source&&row.cardRequestKey?.startsWith("yjy-pilot-makeup:")&&row.sourceStatus==="CANCELLED"&&row.sourceAbsenceKind==="STUDENT_LEAVE"&&Number(row.purchaseCount)===0)return {price:source.originalUnitPrice,makeup:true};
  const m=proof.oldMakeup;
  if(row.musicOpeningMakeupEntitlementId===m.id&&row.makeupContentHash===m.contentHash&&row.customerId===m.customerId&&row.makeupCustomerId===m.customerId&&row.templateId===m.templateId&&row.makeupTemplateId===m.templateId)return {price:m.originalUnitPrice,makeup:true};
  if(row.bookingKind==="TRIAL"&&row.customerId===proof.trial.customerId&&row.templateId===proof.trial.templateId)return {price:proof.trial.base,makeup:false};
  return null;
}
