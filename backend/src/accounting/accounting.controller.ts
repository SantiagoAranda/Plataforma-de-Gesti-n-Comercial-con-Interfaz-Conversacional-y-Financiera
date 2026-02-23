import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { AccountingService } from './accounting.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('entries')
  createEntry(@Req() req: any, @Body() dto: CreateEntryDto) {
    return this.accountingService.createEntry(req.user.businessId, dto);
  }

  @Get('entries')
  listEntries(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.listEntries(req.user.businessId, { status, from, to });
  }

  @Get('entries/:id')
  getEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.getEntry(req.user.businessId, id);
  }

  @Post('entries/:id/post')
  postEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.postEntry(req.user.businessId, id);
  }

  @Post('entries/:id/void')
  voidEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.voidEntry(req.user.businessId, id);
  }

   @Get('puc/clases')
  listPucClases() {
    return this.accountingService.listPucClases();
  }

  @Get('puc/grupos')
  listPucGrupos(@Query('clase') clase: string) {
    return this.accountingService.listPucGrupos(clase);
  }

  @Get('puc/search')
  searchPuc(@Query('q') q: string) {
    return this.accountingService.searchPuc(q ?? '');
  }

  // ✅ PARAMÉTRICA AL FINAL
  @Get('puc/:code')
  getPuc(@Param('code') code: string) {
    return this.accountingService.getPuc(code);
  }

}