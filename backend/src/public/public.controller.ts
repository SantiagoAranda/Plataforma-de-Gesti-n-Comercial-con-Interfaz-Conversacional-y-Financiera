import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
} from '@nestjs/common';
import { PublicService } from './public.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':slug/items')
  listPublicItems(
    @Param('slug') slug: string,
    @Query('type') type?: string,
  ) {
    return this.publicService.listPublicItems(slug, type);
  }

  @Get(':slug/availability')
  getAvailability(
    @Param('slug') slug: string,
    @Query('itemId') itemId: string,
    @Query('date') date: string,
  ) {
    return this.publicService.getAvailability(slug, itemId, date);
  }

  @Get(':slug/availability-calendar')
  getAvailabilityCalendar(
    @Param('slug') slug: string,
    @Query('itemId') itemId: string,
    @Query('month') month: string,
  ) {
    return this.publicService.getAvailabilityCalendar(slug, itemId, month);
  }

  @Post(':slug/reserve')
  createReservation(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.publicService.createReservation(slug, body);
  }

  @Post(':slug/order')
  createOrder(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicOrderDto,
  ) {
    return this.publicService.createOrder(slug, dto);
  }
}
