// src/accounting/accounting.controller.ts  (agregá esto, respetando tu archivo actual)
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { AccountingService } from './accounting.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { MovementsQueryDto } from './dto/movements-query.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) { }

  // ---- ENTRIES ----
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

  @Patch('entries/:id')
  updateEntry(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateEntryDto) {
    return this.accountingService.updateEntry(req.user.businessId, id, dto);
  }

  @Delete('entries/:id')
  deleteEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.deleteEntry(req.user.businessId, id);
  }

  @Post('entries/:id/post')
  postEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.postEntry(req.user.businessId, id);
  }

  @Post('entries/:id/void')
  voidEntry(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.voidEntry(req.user.businessId, id);
  }

  // ---- MOVEMENTS ----
  @Post('movements')
  createMovement(@Req() req: any, @Body() dto: CreateMovementDto) {
    return this.accountingService.createMovement(req.user.businessId, dto);
  }

  @Get('movements')
  listMovements(@Req() req: any, @Query() q: MovementsQueryDto) {
    return this.accountingService.listMovements(req.user.businessId, q);
  }

  // ---- REPORTS ----
  @Get('reports/pnl')
  pnl(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.accountingService.reportPnl(req.user.businessId, { from, to });
  }

  @Get('reports/balance-sheet')
  balanceSheet(@Req() req: any, @Query('date') date: string) {
    return this.accountingService.reportBalanceSheet(req.user.businessId, { date });
  }

  @Get('reports/cash-flow')
  cashFlow(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.accountingService.reportCashFlow(req.user.businessId, { from, to });
  }

  // ---- PUC ----
  @Get('puc/clases')
  listPucClases() {
    return this.accountingService.listPucClases();
  }

  @Get('puc/grupos')
  listPucGrupos(@Query('clase') clase: string) {
    return this.accountingService.listPucGrupos(clase);
  }

  @Get('puc/cuentas')
  listPucCuentas(@Query('grupo') grupo: string) {
    return this.accountingService.listPucCuentas(grupo);
  }

  @Get('puc/subcuentas')
  listPucSubcuentas(@Query('cuenta') cuenta: string) {
    return this.accountingService.listPucSubcuentas(cuenta);
  }

  @Get('puc/search')
  searchPuc(@Query('q') q: string) {
    return this.accountingService.searchPuc(q ?? '');
  }

  @Get('puc/:code')
  getPuc(@Param('code') code: string) {
    return this.accountingService.getPuc(code);
  }

  @Get('movements/progress')
  movementsProgress(@Req() req: any, @Query('date') date?: string) {
    return this.accountingService.movementsProgress(req.user.businessId, { date });
  }
}
