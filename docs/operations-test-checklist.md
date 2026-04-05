# Operations Test Checklist (10 Scenarios)

## Scenario 1: Customer Self-Booking (Regular)
1. Login as customer with active wallet (remainingSessions > 0)
2. Go to `/book/new` — verify remaining quota shows correctly
3. Select a date on calendar — verify green/yellow/red dots match availability
4. Select a time slot with available capacity
5. Set people = 2, confirm booking
6. **Expected:** Booking created (CONFIRMED), wallet remainingSessions decremented by 1
7. Check `/my-bookings` — new booking appears in "upcoming" tab
8. Check `/my-plans` — session grid shows new entry with blue (confirmed) cell

## Scenario 2: Customer Self-Booking (Makeup)
1. Customer must have an unused MakeupCredit
2. Go to `/book/new` — verify "can use makeup X times" banner shows
3. Check "use makeup qualification" checkbox
4. Select a credit from dropdown, pick date + slot, confirm
5. **Expected:** Booking created with isMakeup=true, wallet NOT decremented, MakeupCredit.isUsed=true

## Scenario 3: Staff Check-In
1. Login as staff, go to day view for today
2. Find a CONFIRMED booking, click into detail
3. Click "report" button
4. **Expected:** isCheckedIn=true, badge shows on booking detail and day view

## Scenario 4: Staff Mark Completed
1. On a CONFIRMED (or PENDING) booking detail page
2. Click "mark completed"
3. **Expected:** Status changes to COMPLETED, SESSION_DEDUCTION transaction created, wallet unchanged (pre-deducted)

## Scenario 5: Staff Mark No-Show (Regular Booking)
1. Find a CONFIRMED regular booking (isMakeup=false)
2. Click "no-show" — confirm dialog says wallet won't refund, makeup credit auto-generated
3. **Expected:** Status = NO_SHOW, new MakeupCredit created (30-day expiry), wallet NOT refunded

## Scenario 6: Staff Mark No-Show (Makeup Booking)
1. Find a CONFIRMED makeup booking (isMakeup=true)
2. Click "no-show" — confirm dialog says no new makeup credit
3. **Expected:** Status = NO_SHOW, NO new MakeupCredit generated, makeup credit stays used

## Scenario 7: Customer Cancel Booking (Regular)
1. Customer goes to `/my-bookings`, click "cancel this booking"
2. Confirm cancellation
3. **Expected:** Status = CANCELLED, wallet remainingSessions +1 (refund)

## Scenario 8: Staff Cancel Booking (Makeup)
1. Staff opens a makeup booking detail, click cancel with optional note
2. **Expected:** Status = CANCELLED, MakeupCredit.isUsed set back to false (credit restored), wallet NOT changed

## Scenario 9: Dashboard New Booking by Staff
1. Staff goes to `/dashboard/bookings/new`
2. Search and select customer, pick date + slot + people count
3. Submit booking
4. **Expected:** Booking created, wallet pre-deducted, shows in day view

## Scenario 10: Multi-Person Booking Capacity Check
1. A slot has capacity=6 with 5 people already booked
2. Customer tries to book people=2 for that slot
3. **Expected:** Slot shows "insufficient capacity" label, radio button disabled
4. Customer changes people=1, slot becomes selectable
5. After booking, day view shows correct total (6/6 = full, red indicator)
