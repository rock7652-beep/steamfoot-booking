"use client";
import { CourseHealthWorkspace } from "@/components/course-health-workspace";
export function CourseCustomerHealth({ customerId, canEdit, onDirtyChange, onPending }: { customerId: string; canEdit: boolean; onDirtyChange?: (value: boolean) => void; onPending?: (value: boolean) => void }) {
  return <CourseHealthWorkspace key={customerId} customerId={customerId} canEdit={canEdit} onDirtyChange={onDirtyChange} onPending={onPending} />;
}
