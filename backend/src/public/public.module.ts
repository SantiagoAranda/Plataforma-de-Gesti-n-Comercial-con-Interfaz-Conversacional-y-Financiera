import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemOptionsModule } from '../item-options/item-options.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaxModule } from '../tax/tax.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    StorageModule,
    InventoryModule,
    ItemOptionsModule,
    NotificationsModule,
    TaxModule,
    CommonModule,
  ],
  controllers: [PublicController],
  providers: [PublicService, PrismaService],
})
export class PublicModule {}
