-- Cancelled reservations must not keep their slot occupied.
-- The previous unique index counted CANCELLED rows, so a cancelled start could never be
-- booked again. Every row set unique under the old index is also unique under this subset,
-- so existing data is always compatible and no rows are modified.
DROP INDEX "Reservation_itemId_date_startMinute_key";

CREATE UNIQUE INDEX "Reservation_active_slot_key"
  ON "Reservation"("itemId", "date", "startMinute")
  WHERE "status" <> 'CANCELLED';
