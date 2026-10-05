"use client";
import { useRouter } from "next/navigation";
import { StaffAccountEditor, type StaffAccountPolicy } from "./staff-account-editor";
import type { StaffWorkspacePerson } from "./staff-workspace";

/** Compatibility for bookmarked edit URLs; normal list edits stay in place. */
export function StaffAccountRoute({ person, policy }: { person: StaffWorkspacePerson; policy: StaffAccountPolicy }) {
  const router = useRouter();
  return <StaffAccountEditor person={person} policy={policy} onClose={() => router.push("/dashboard/staff")}/>;
}
