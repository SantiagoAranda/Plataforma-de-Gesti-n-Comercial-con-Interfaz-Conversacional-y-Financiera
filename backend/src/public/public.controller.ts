import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
} from '@nestjs/common';
import { PublicService } from './public.service';

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

  @Post(':slug/reserve')
  createReservation(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.publicService.createReservation(slug, body);
  }
}