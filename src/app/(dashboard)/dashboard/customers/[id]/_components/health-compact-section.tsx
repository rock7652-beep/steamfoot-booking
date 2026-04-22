import { HealthSectionWrapper } from "../health-section";
import { HealthSummarySection } from "../health-summary";

interface Props {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  healthLinkStatus: string;
  healthProfileId: string | null;
}

export function HealthCompactSection({
  customerId,
  customerEmail,
  customerPhone,
  healthLinkStatus,
  healthProfileId,
}: Props) {
  return (
    <section id="health" className="scroll-mt-16">
      <HealthSectionWrapper
        customerId={customerId}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
        healthLinkStatus={healthLinkStatus}
        healthProfileId={healthProfileId}
      >
        {healthProfileId && (
          <HealthSummarySection healthProfileId={healthProfileId} customerId={customerId} />
        )}
      </HealthSectionWrapper>
    </section>
  );
}
