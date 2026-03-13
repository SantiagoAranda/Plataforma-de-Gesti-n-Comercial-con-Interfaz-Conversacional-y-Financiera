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
import { CreateAccountingMovementDto } from './dto/create-accounting-movement.dto';
import { AccountingMovementsQueryDto } from './dto/accounting-movements-query.dto';
import { UpdateAccountingMovementDto } from './dto/update-accounting-movement.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) { }

  // ---- MOVEMENTS (nuevo modelo) ----
  @Post('movements')
  createMovement(@Req() req: any, @Body() dto: CreateAccountingMovementDto) {
    return this.accountingService.createMovement(req.user.businessId, dto);
  }

  @Get('movements')
  listMovements(@Req() req: any, @Query() q: AccountingMovementsQueryDto) {
    return this.accountingService.findAllMovements(req.user.businessId, q);
  }

  @Get('movements/:id')
  getMovement(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.findOneMovement(req.user.businessId, id);
  }

  @Patch('movements/:id')
  updateMovement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAccountingMovementDto,
  ) {
    return this.accountingService.updateMovement(req.user.businessId, id, dto);
  }

  @Delete('movements/:id')
  deleteMovement(@Req() req: any, @Param('id') id: string) {
    return this.accountingService.removeMovement(req.user.businessId, id);
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
}
