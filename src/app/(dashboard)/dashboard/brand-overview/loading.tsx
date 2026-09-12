import { LoadingStatus } from "@/components/loading-status";

import { BrandOverviewSkeleton } from "./skeleton";

export default function Loading() {
  return <><LoadingStatus /><BrandOverviewSkeleton /></>;
}
