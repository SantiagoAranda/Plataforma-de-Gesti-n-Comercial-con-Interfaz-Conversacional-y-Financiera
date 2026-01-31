import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  // POST /reservations
  @Post()
  create(@Body() body: any) {
    return this.reservationsService.create(body);
  }

  // GET /reservations
  @Get()
  findAll() {
    return this.reservationsService.findAll();
  }

  // GET /reservations/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }
}
