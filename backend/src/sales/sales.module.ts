import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemOptionsModule } from '../item-options/item-options.module';
import { TaxModule } from '../tax/tax.module';
import { CommonModule } from '../common/common.module';
import { ElectronicSaleReversalGuard } from './electronic-sale-reversal.guard';

@Module({
  imports: [PrismaModule, AccountingModule, InventoryModule, ItemOptionsModule, TaxModule, CommonModule],
  controllers: [SalesController],
  providers: [SalesService, ElectronicSaleReversalGuard],
})
export class SalesModule {}
