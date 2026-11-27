import { notFound } from "next/navigation";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { assertAiPreview } from "../../../../../scripts/ai-digital-butler-preview-scope.mjs";
import { brandManagementRuntime } from "@/server/ai/brand-management";
import { BrandAiWorkspace } from "./workspace";
export const dynamic="force-dynamic";
export default async function BrandAiManagementPage() {
  try{assertAiPreview();}catch{notFound();}
  const user=await requirePermission("audit.read");
  if(user.role!=="ADMIN"||!await checkPermission(user.role,user.staffId,"audit.read"))notFound();
  const snapshot=await brandManagementRuntime().snapshot();
  return <main className="min-w-0 space-y-4"><header><h1 className="admin-page-title">品牌 AI 服務管理</h1><p className="mt-1 text-sm text-earth-500">蒸管家品牌智慧客服・HQ 隔離驗收</p></header><BrandAiWorkspace key={snapshot.viewKey} snapshot={snapshot}/></main>;
}
