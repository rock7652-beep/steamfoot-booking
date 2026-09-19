# Zhubei opt-in trial notification pilot

## Scope and authorization

The user approved simulated new-customer tests plus a personal LINE test, followed by a limited Zhubei trial with the original booking route retained. No new Official Account, no unlinking of the user's existing account, no mass send, and no LINE console changes.

- Pilot entry: `/pricing/experience/zhubei/book?lineTrial=1#booking-form`.
- Normal entry remains `/pricing/experience/zhubei/book#booking-form` and accepts the original public form.
- Hsinchu and Taichung do not opt in. Existing LIFF bridge behavior is retained for all stores.
- The pilot button opens Zhubei OA `@083vmikb` with `開始體驗預約` prefilled. Sending is a deliberate user action.
- The verified store webhook returns a 30-minute one-use link carrying the sender identity and `lineTrial=1`. The query flag only controls UX; it is not authentication. The server verifies the signed entry and store before linking.
- The signed pilot submission returns explicit notification setup status. Ordinary submissions do not invoke the new setup service.

## Why use the store chat

Authenticated LINE Developers inspection confirmed shared Login channel `2010761154` is linked to `@329rmywc` (platform customer support), not Zhubei OA. Its friendship check must not be a store booking gate. The pilot uses the store webhook identity directly, without changing any production LIFF endpoint or linked OA.

## Automated evidence

- Simulated new customer: signed store identity is written with LINKED status, booking uses LINE channel, and the one-time entry is consumed.
- Existing linked customer: no second customer is created.
- Invalid entry and ownership conflict: no booking or identity overwrite.
- Ordinary public forms remain usable across all three stores; the pilot flag is ineffective outside Zhubei.
- Trial-care simulation: a completed, linked trial with no paid package receives stage 0 next-day check-in through its own store. Preview sending remains blocked.
- These are mocked automated tests, not proof of a new real LINE account's complete journey or actual notification delivery.

## Manual acceptance still required

1. Owner opens the pilot URL on their phone, sends the prefilled command, and receives the personal booking card.
2. Owner opens that card and verifies the form and their own binding. Existing FIRST_TRIAL history may correctly prevent another first trial; do not unlink, delete history, or bypass this rule to make the test pass.
3. Any test booking is a real reservation: agree on its time first, label it, and cancel it after verification. Do not create one without that arrangement.
4. Check only the owner's notification recipient and test message. Do not invoke the all-store reminder job to test one person.
5. On the first real new customer's normal pilot booking, verify store-scoped linkage and the scheduled reminder result. Full-new-account acceptance remains pending until then.

## Rollback

Stop distributing the pilot URL and remove `lineTrial=1` to return to the unchanged normal form. Do not change existing account bindings or LINE channel settings. If a code issue is found, revert the pilot commit via the normal reviewed Git workflow.
