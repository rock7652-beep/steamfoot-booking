import { EmptyRow } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { WALLET_STATUS_LABEL } from "@/lib/booking-constants";
import { AssignPlanForm } from "../assign-plan-form";
import { AdjustWalletForm } from "../adjust-wallet-form";

interface PlanOption {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface Wallet {
  id: string;
  status: string;
  remainingSessions: number;
  totalSessions: number;
  purchasedPrice: unknown;
  startDate: Date;
  expiryDate: Date | null;
  plan: { name: string };
}

interface Props {
  customerId: string;
  activeWallets: Wallet[];
  inactiveWallets: Wallet[];
  plans: PlanOption[];
  canDiscount: boolean;
  userRole: string;
}

function WalletItem({ w, userRole }: { w: Wallet; userRole: string }) {
  return (
    <div className="rounded-lg border border-earth-200 p-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-medium text-earth-900">{w.plan.name}</span>
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
              w.status === "ACTIVE"
                ? "bg-green-50 text-green-700"
                : "bg-earth-100 text-earth-600"
            }`}
          >
            {WALLET_STATUS_LABEL[w.status] ?? w.status}
          </span>
        </div>
        <div className="text-right text-sm">
          <span className="text-lg font-bold text-primary-700">{w.remainingSessions}</span>
          <span className="text-earth-500"> / {w.totalSessions} 堂</span>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-earth-400">
        <span>購入 NT$ {Number(w.purchasedPrice).toLocaleString()}</span>
        <span>開始 {formatTWTime(w.startDate, { dateOnly: true })}</span>
        {w.expiryDate && <span>到期 {formatTWTime(w.expiryDate, { dateOnly: true })}</span>}
      </div>
      {userRole === "ADMIN" && w.status === "ACTIVE" && (
        <div className="mt-2 border-t pt-2">
          <AdjustWalletForm walletId={w.id} currentRemaining={w.remainingSessions} />
        </div>
      )}
    </div>
  );
}

export function PlansSection({
  customerId,
  activeWallets,
  inactiveWallets,
  plans,
  canDiscount,
  userRole,
}: Props) {
  const hasAny = activeWallets.length + inactiveWallets.length > 0;

  return (
    <section
      id="plan"
      className="scroll-mt-16 rounded-[20px] border border-earth-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-earth-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-earth-900">課程方案</h2>
          <p className="text-[12px] text-earth-400">目前有效方案與歷史方案</p>
        </div>
        <AssignPlanForm
          customerId={customerId}
          canDiscount={canDiscount}
          plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            price: p.price,
            sessionCount: p.sessionCount,
          }))}
        />
      </header>

      <div className="px-6 py-5">
        {!hasAny ? (
          <EmptyRow
            title="尚未購買課程"
            hint="指派方案後，顧客即可用堂數預約"
            cta={{ label: "立即指派方案", href: "#plan" }}
            dense
          />
        ) : (
          <div className="space-y-3">
            {activeWallets.length > 0 && (
              <div className="space-y-2">
                {activeWallets.map((w) => (
                  <WalletItem key={w.id} w={w} userRole={userRole} />
                ))}
              </div>
            )}
            {inactiveWallets.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-earth-400">
                  歷史方案
                </p>
                <div className="space-y-2 opacity-60">
                  {inactiveWallets.map((w) => (
                    <WalletItem key={w.id} w={w} userRole={userRole} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
