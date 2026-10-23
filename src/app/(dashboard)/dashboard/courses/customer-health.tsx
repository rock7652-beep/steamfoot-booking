"use client";
import { CourseHealthWorkspace } from "@/components/course-health-workspace";
export function CourseCustomerHealth({scope, compact=false, customerId, canEdit, onDirtyChange, onPending }: {scope?:"beauty"; compact?:boolean; customerId: string; canEdit: boolean; onDirtyChange?: (value: boolean) => void; onPending?: (value: boolean) => void }) {
  return <CourseHealthWorkspace scope={scope} compact={compact} key={customerId} customerId={customerId} canEdit={canEdit} onDirtyChange={onDirtyChange} onPending={onPending} />;
}
