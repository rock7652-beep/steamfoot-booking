# Exception Scenario Checklist (10 Scenarios)

## Scenario 1: Double-Book Same Slot
- Customer A books slot 10:00 (capacity fills to 6/6)
- Customer B tries to book same slot
- **Expected:** Slot shows "full" in calendar, radio disabled. If somehow submitted, server action rejects with capacity check error.

## Scenario 2: Book with Zero Wallet
- Customer has 0 remainingSessions, no makeup credits
- Go to `/book/new`
- **Expected:** Yellow warning "booking reached wallet limit", no booking form rendered

## Scenario 3: Book with Expired Makeup Credit
- MakeupCredit exists but expiredAt < today
- **Expected:** Credit not shown in dropdown (filtered by query). If ID manually submitted, server action validates and rejects.

## Scenario 4: Cancel Already Completed Booking
- Booking status = COMPLETED
- Staff tries to access action buttons
- **Expected:** Action buttons (cancel/no-show/complete) not rendered for non-active bookings. Server action also checks status before proceeding.

## Scenario 5: No-Show on Already Cancelled Booking
- Booking status = CANCELLED
- Direct API call to markNoShow
- **Expected:** Server action checks `bookingStatus in [PENDING, CONFIRMED]` and rejects

## Scenario 6: Use Same Makeup Credit Twice
- MakeupCredit.isUsed = true
- Another booking tries to reference same creditId
- **Expected:** createBooking validates credit.isUsed === false before proceeding. Returns error if already used.

## Scenario 7: Concurrent Booking Race Condition
- Two users simultaneously book the last slot
- **Expected:** Prisma transaction with capacity check inside prevents double-booking. One succeeds, one gets "slot full" error.

## Scenario 8: Cancel After No-Show Credit Used
- Booking A marked NO_SHOW, generates MakeupCredit C
- MakeupCredit C used for Booking B
- Staff tries to somehow "undo" Booking A's no-show
- **Expected:** No undo action exists for NO_SHOW. Status is terminal. Credit C remains used.

## Scenario 9: Customer Without selfBookingEnabled
- Customer.selfBookingEnabled = false
- Navigate to `/book/new`
- **Expected:** Page shows "self-booking not enabled" message with instructions to contact manager

## Scenario 10: Wallet Inconsistency After Partial Failure
- createBooking transaction: booking created but wallet update fails mid-transaction
- **Expected:** Prisma $transaction is atomic — entire operation rolls back. No partial state. Booking not created, wallet unchanged.
