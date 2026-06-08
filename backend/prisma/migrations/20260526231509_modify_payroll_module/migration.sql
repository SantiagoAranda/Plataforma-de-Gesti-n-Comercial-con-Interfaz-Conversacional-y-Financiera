-- AlterTable
ALTER TABLE "PayrollBusinessParameter" ADD COLUMN     "dailyHours" DECIMAL(10,2),
ADD COLUMN     "maxSupplementaryHours" INTEGER,
ADD COLUMN     "maxWorkedDaysMonth" INTEGER;

-- AlterTable
ALTER TABLE "PayrollGlobalParameter" ADD COLUMN     "dailyHours" DECIMAL(10,2) NOT NULL DEFAULT 8,
ADD COLUMN     "maxSupplementaryHours" INTEGER NOT NULL DEFAULT 720,
ADD COLUMN     "maxWorkedDaysMonth" INTEGER NOT NULL DEFAULT 30;
