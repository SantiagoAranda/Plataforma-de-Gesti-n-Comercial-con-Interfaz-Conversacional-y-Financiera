import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemOptionsModule } from '../item-options/item-options.module';

@Module({
  imports: [PrismaModule, AccountingModule, InventoryModule, ItemOptionsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
