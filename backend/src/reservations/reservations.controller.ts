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
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

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

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.reservationsService.cancel(req.user.businessId, id);
  }
}
