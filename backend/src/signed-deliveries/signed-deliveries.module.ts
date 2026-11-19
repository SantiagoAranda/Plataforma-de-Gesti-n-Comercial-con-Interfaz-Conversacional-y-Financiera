import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { SignedDeliveriesController } from './signed-deliveries.controller';
import { SignedDeliveriesService } from './signed-deliveries.service';

@Module({
  imports: [StorageModule],
  controllers: [SignedDeliveriesController],
  providers: [SignedDeliveriesService, PrismaService],
})
export class SignedDeliveriesModule {}
