# Wallet / Booking / MakeupCredit Consistency Check Rules

## 6 Consistency States

### State 1: Active Booking (PENDING / CONFIRMED)
- Wallet: `remainingSessions` should already be decremented (pre-deducted at creation)
- If `isMakeup = true`: wallet should NOT have been decremented for this booking
- MakeupCredit (if makeup): `isUsed = true`

### State 2: Completed Booking (COMPLETED)
- Wallet: remains decremented (no change at completion)
- Transaction: SESSION_DEDUCTION record should exist
- If `isMakeup = true`: wallet was never deducted; no SESSION_DEDUCTION transaction

### State 3: Cancelled Booking (CANCELLED, non-makeup)
- Wallet: `remainingSessions` should have been incremented back (+1 refund)
- The net wallet effect of create + cancel = 0

### State 4: Cancelled Booking (CANCELLED, makeup)
- Wallet: unchanged (never deducted for makeup)
- MakeupCredit: `isUsed = false` (restored)

### State 5: No-Show Booking (NO_SHOW, non-makeup)
- Wallet: remains decremented (no refund on no-show)
- MakeupCredit: a new credit should exist with `originalBookingId = this booking`
- Generated credit: `isUsed = false`, `expiredAt = booking date + 30 days`

### State 6: No-Show Booking (NO_SHOW, makeup)
- Wallet: unchanged (never deducted for makeup)
- MakeupCredit consumed: stays `isUsed = true` (no new credit generated for makeup no-shows)
- No new MakeupCredit generated

---

## Verification Queries

### Check 1: Wallet balance matches bookings
```sql
-- For each active wallet, verify:
-- remainingSessions = totalSessions - (count of non-cancelled, non-makeup bookings linked to this wallet)
SELECT
  w.id,
  w."totalSessions",
  w."remainingSessions",
  w."totalSessions" - COUNT(b.id) AS expected_remaining
FROM "CustomerPlanWallet" w
LEFT JOIN "Booking" b ON b."customerPlanWalletId" = w.id
  AND b."bookingStatus" NOT IN ('CANCELLED')
  AND b."isMakeup" = false
GROUP BY w.id
HAVING w."remainingSessions" != w."totalSessions" - COUNT(b.id);
-- Should return 0 rows if consistent
```

### Check 2: Every NO_SHOW non-makeup booking has a MakeupCredit
```sql
SELECT b.id, b."bookingDate", b."slotTime"
FROM "Booking" b
LEFT JOIN "MakeupCredit" mc ON mc."originalBookingId" = b.id
WHERE b."bookingStatus" = 'NO_SHOW'
  AND b."isMakeup" = false
  AND mc.id IS NULL;
-- Should return 0 rows
```

### Check 3: No NO_SHOW makeup booking has generated a MakeupCredit
```sql
SELECT b.id, mc.id AS credit_id
FROM "Booking" b
JOIN "MakeupCredit" mc ON mc."originalBookingId" = b.id
WHERE b."bookingStatus" = 'NO_SHOW'
  AND b."isMakeup" = true;
-- Should return 0 rows
```

### Check 4: Used MakeupCredits are linked to active/completed makeup bookings
```sql
SELECT mc.id, mc."isUsed", b."bookingStatus"
FROM "MakeupCredit" mc
JOIN "Booking" b ON b."makeupCreditId" = mc.id
WHERE mc."isUsed" = true
  AND b."bookingStatus" = 'CANCELLED';
-- Should return 0 rows (cancelled bookings should restore credit)
```

### Check 5: Cancelled makeup bookings have their credits restored
```sql
SELECT b.id, mc.id AS credit_id, mc."isUsed"
FROM "Booking" b
JOIN "MakeupCredit" mc ON b."makeupCreditId" = mc.id
WHERE b."bookingStatus" = 'CANCELLED'
  AND mc."isUsed" = true;
-- Should return 0 rows (credit should be isUsed=false)
```

### Check 6: No expired unused credits are referenced by active bookings
```sql
SELECT b.id, mc.id AS credit_id, mc."expiredAt"
FROM "Booking" b
JOIN "MakeupCredit" mc ON b."makeupCreditId" = mc.id
WHERE b."bookingStatus" IN ('PENDING', 'CONFIRMED')
  AND mc."expiredAt" < NOW();
-- These are active bookings using expired credits — should be 0 or reviewed
```

---

## Automated Fix Approach

If inconsistencies are found, use the following approach:

1. **Wallet balance mismatch (Check 1):**
   - Recalculate: `UPDATE "CustomerPlanWallet" SET "remainingSessions" = "totalSessions" - (SELECT COUNT(*) FROM "Booking" WHERE ...)`
   - Only after manual review to confirm no other factors

2. **Missing MakeupCredit (Check 2):**
   - Generate missing credits: `INSERT INTO "MakeupCredit" (id, customerId, originalBookingId, isUsed, expiredAt) ...`
   - Set `expiredAt = bookingDate + 30 days`

3. **Orphaned credits (Check 3):**
   - Delete orphaned credits that shouldn't exist

4. **Credit state mismatches (Checks 4-5):**
   - Flip `isUsed` to match booking state

5. **Always run all 6 checks after any manual database operation or migration**
