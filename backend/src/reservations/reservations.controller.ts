import { UseInterceptors } from '@nestjs/common';
import { ReservationConflictInterceptor } from '../reservations/reservation-conflict.interceptor';
import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';

import { ReservationsService } from './reservations.service';
import { SalesService } from '../sales/sales.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

@UseInterceptors(ReservationConflictInterceptor)
@Controller('reservations')
export class ReservationsController {
  constructor(
    private reservationsService: ReservationsService,
    private salesService: SalesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  create(@Req() req: any, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(req.user.businessId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  findByDate(@Req() req: any, @Query('date') date: string) {
    return this.reservationsService.findByDate(req.user.businessId, date);
  }

  @Get('availability')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getAvailability(
    @Req() req: any,
    @Query('itemId') itemId: string,
    @Query('date') date: string,
  ) {
    return this.reservationsService.getAvailability(
      req.user.businessId,
      itemId,
      date,
    );
  }

  @Get('availability-calendar')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getAvailabilityCalendar(
    @Req() req: any,
    @Query('itemId') itemId: string,
    @Query('month') month: string,
  ) {
    return this.reservationsService.getAvailabilityCalendar(
      req.user.businessId,
      itemId,
      month,
    );
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  cancel(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: unknown }) {
    return this.reservationsService.cancel(req.user.businessId, id, body?.reason);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  confirm(@Req() req: any, @Param('id') id: string) {
    // Same commercial confirmation as Ventas (inventory + accounting); a status-only
    // confirm would leave CONFIRMED reservations without their effects.
    return this.salesService.confirmOrder(
      req.user.businessId,
      id,
      undefined,
      'RESERVATION',
    );
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  complete(@Req() req: any, @Param('id') id: string, @Body() body: { serviceProvided?: unknown }) {
    return this.salesService.completeReservation(req.user.businessId, id, body?.serviceProvided);
  }

  // Policy 2: the customer did not attend. Explicit confirmation required; no commercial effect.
  @Post(':id/no-show')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  noShow(@Req() req: any, @Param('id') id: string, @Body() body: { confirmed?: unknown }) {
    return this.salesService.markNoShow(req.user.businessId, id, body?.confirmed);
  }

  @Patch(':id/reschedule')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  reschedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RescheduleReservationDto,
  ) {
    return this.reservationsService.reschedule(req.user.businessId, id, dto);
  }
}
