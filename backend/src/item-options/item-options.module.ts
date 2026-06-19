import { Module } from '@nestjs/common';
import { ItemOptionsController } from './item-options.controller';
import { ItemOptionsService } from './item-options.service';

@Module({
  controllers: [ItemOptionsController],
  providers: [ItemOptionsService],
  exports: [ItemOptionsService],
})
export class ItemOptionsModule {}
