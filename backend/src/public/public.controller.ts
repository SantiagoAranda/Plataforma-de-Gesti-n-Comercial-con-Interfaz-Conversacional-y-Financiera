import { UseInterceptors } from '@nestjs/common';
import { ReservationConflictInterceptor } from '../reservations/reservation-conflict.interceptor';
import {
  Controller,
  Get,
  Header,
  Query,
  Param,
  Post,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { PublicService } from './public.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePublicReservationDto } from './dto/create-public-reservation.dto';
import { CancelPublicReservationDto } from './dto/cancel-public-reservation.dto';
import { TaxPreviewDto } from '../tax/dto/tax-preview.dto';

@UseInterceptors(ReservationConflictInterceptor)
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // ── Ruta pública de consulta de reserva por ID (sin autenticación) ──────
  // IMPORTANTE: debe declararse ANTES de ':slug/...' para evitar colisión de rutas.
  @Get('reservations/:id')
  @Header('Cache-Control', 'no-store')
  async getReservationById(@Param('id') id: string) {
    const reservation = await this.publicService.findReservationById(id);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return reservation;
  }

  @Post('reservations/:id/cancel')
  @Header('Cache-Control', 'no-store')
  async cancelReservation(
    @Param('id') id: string,
    @Body() dto: CancelPublicReservationDto,
  ) {
    const reservation = await this.publicService.cancelReservation(
      id,
      dto?.token,
      dto?.reason,
    );
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return reservation;
  }

  // Canonical slug for server-side 308 redirects and store metadata.
  @Get(':slug/resolve')
  @Header('Cache-Control', 'no-store')
  async resolveStore(@Param('slug') slug: string) {
    const store = await this.publicService.resolveStore(slug);
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  @Get(':slug/reservations')
  @Header('Cache-Control', 'no-store')
  findReservationsByPhone(
    @Param('slug') slug: string,
    @Query('phone') phone: string,
  ) {
    return this.publicService.findReservationsByPhone(slug, phone);
  }

  @Get(':slug/items')
  @Header('Cache-Control', 'no-store')
  listPublicItems(@Param('slug') slug: string, @Query('type') type?: string) {
    return this.publicService.listPublicItems(slug, type);
  }

  @Get(':slug/availability')
  @Header('Cache-Control', 'no-store')
  getAvailability(
    @Param('slug') slug: string,
    @Query('itemId') itemId: string,
    @Query('date') date: string,
  ) {
    return this.publicService.getAvailability(slug, itemId, date);
  }

  @Get(':slug/availability-calendar')
  @Header('Cache-Control', 'no-store')
  getAvailabilityCalendar(
    @Param('slug') slug: string,
    @Query('itemId') itemId: string,
    @Query('month') month: string,
  ) {
    return this.publicService.getAvailabilityCalendar(slug, itemId, month);
  }

  @Post(':slug/reserve')
  @Header('Cache-Control', 'no-store')
  createReservation(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicReservationDto,
  ) {
    return this.publicService.createReservation(slug, dto);
  }

  @Post(':slug/order')
  @Header('Cache-Control', 'no-store')
  createOrder(@Param('slug') slug: string, @Body() dto: CreatePublicOrderDto) {
    return this.publicService.createOrder(slug, dto);
  }

  @Get(':slug/fiscal-settings')
  @Header('Cache-Control', 'no-store')
  getFiscalSettings(@Param('slug') slug: string) {
    return this.publicService.getFiscalSettings(slug);
  }

  @Get(':slug/fiscal-municipalities')
  @Header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  @Header('ETag', '"factus-municipalities-v2-2026-09"')
  getFiscalMunicipalities(@Param('slug') slug: string) {
    return this.publicService.getFiscalMunicipalities(slug);
  }

  @Post(':slug/tax-preview')
  @Header('Cache-Control', 'no-store')
  calculateTaxPreview(@Param('slug') slug: string, @Body() dto: TaxPreviewDto) {
    return this.publicService.calculateTaxPreview(slug, dto);
  }
}
