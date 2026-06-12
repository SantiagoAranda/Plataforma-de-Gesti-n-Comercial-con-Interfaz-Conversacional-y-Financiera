import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { StorageModule } from '../storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [StorageModule, InventoryModule],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
