import { CustomerBookingRescheduleManager } from "./reschedule-manager";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerBookingReschedulePage({ params }: PageProps) {
  const { id } = await params;
  return <CustomerBookingRescheduleManager bookingId={id} />;
}
