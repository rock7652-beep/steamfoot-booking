import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
type Checkout = NonNullable<BookingDrawerPayload["participantCheckout"]>;
export const state: Checkout = {
  canCollect: true, canResolve: true, canSell: true, canDiscount: false,
  settings: { allowEdit: true, defaultPrice: 499, minPrice: 0, maxPrice: 3000 },
  plans: [{ id: "plan", name: "蒸足十堂方案", category: "PACKAGE", price: 5990, sessionCount: 10, validityDays: 90 }],
  slots: [
    { id: "slot-1", position: 1, revision: 1, customerId: "booker", name: "呂明憲（宗諺爸）", service: "FIRST_TRIAL", status: "PENDING", collectedAmount: null },
    { id: "slot-2", position: 2, revision: 1, customerId: null, name: null, service: "FIRST_TRIAL", status: "PENDING", collectedAmount: null },
  ],
};
export const sales: Array<{ customerId: string; planId: string }> = [];
export async function findBookingCompanionByPhone() { return { success: true, data: [{ id: "friend", name: "同行朋友（長姓名顯示測試）", phoneMasked: "0912***678" }] }; }
export async function attachBookingCompanion(input: { position: number; customerId: string }) {
  const person = state.slots.find(slot => slot.position === input.position)!;
  person.customerId = input.customerId; person.name = "同行朋友（長姓名顯示測試）"; person.revision++;
  return { success: true, data: [] };
}
export async function createBookingCompanion(input: { position: number; name: string }) {
  const person = state.slots.find(slot => slot.position === input.position)!;
  person.customerId = "new-friend"; person.name = input.name; person.revision++;
  return { success: true, data: { customerId: person.customerId, name: person.name } };
}
export async function collectBookingParticipantTrial(input: { position: number; amount: number }) {
  if (input.amount > 3000) return { success: false, error: "體驗費超出範圍，未收款；方案請分開購買。" };
  const person = state.slots.find(slot => slot.position === input.position)!;
  person.status = "COMPLETED"; person.collectedAmount = input.amount; person.revision++;
  return { success: true, data: { transactionId: `receipt-${person.id}` } };
}
export async function resolveBookingParticipant(input: { position: number; status: string }) {
  const person = state.slots.find(slot => slot.position === input.position)!;
  person.status = input.status; person.revision++;
  return { success: true, data: undefined };
}
export async function assignPlanToCustomer(input: { customerId: string; planId: string }) {
  sales.push(input); return { success: true, data: { walletId: `wallet-${input.customerId}`, transactionId: `plan-${sales.length}` } };
}

export async function addBookingParticipant() {
  if (state.slots.length >= 4) return { success: false, error: "本組最多 4 人" };
  const position = state.slots.length + 1;
  state.slots.push({ id: `slot-${position}`, position, revision: 1, customerId: null, name: null,
    service: "FIRST_TRIAL", source: "WALK_IN", status: "PENDING", collectedAmount: null });
  return { success: true, data: state.slots.at(-1) };
}
export async function completeBookingParticipantPlan(input: { position: number }) {
  const person = state.slots.find(slot => slot.position === input.position)!;
  person.status = "COMPLETED"; person.service = "PACKAGE_SESSION"; person.revision++;
  return { success: true, data: undefined };
}
