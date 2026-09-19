"use client";
import { CourseHealthWorkspace } from "@/components/course-health-workspace";
export function CourseCustomerHealth({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  return <CourseHealthWorkspace key={customerId} customerId={customerId} canEdit={canEdit} />;
}
