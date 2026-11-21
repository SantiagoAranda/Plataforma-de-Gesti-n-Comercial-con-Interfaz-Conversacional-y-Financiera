import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { AvailabilityModule } from '../availability/availability.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [AvailabilityModule, SalesModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
