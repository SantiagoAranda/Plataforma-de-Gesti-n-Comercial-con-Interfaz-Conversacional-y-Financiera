ALTER TABLE "SaleTaxLine"
ADD COLUMN "orderItemId" TEXT;

CREATE INDEX "SaleTaxLine_orderId_orderItemId_idx"
ON "SaleTaxLine"("orderId", "orderItemId");

ALTER TABLE "SaleTaxLine"
ADD CONSTRAINT "SaleTaxLine_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
