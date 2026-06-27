import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemOptionsModule } from '../item-options/item-options.module';

@Module({
  imports: [StorageModule, InventoryModule, ItemOptionsModule],
  controllers: [PublicController],
  providers: [PublicService, PrismaService],
})
export class PublicModule {}
