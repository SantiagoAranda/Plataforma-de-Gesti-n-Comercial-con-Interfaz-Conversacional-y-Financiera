import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SimpleTaxPeriodType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { SimpleTaxService } from './simple-tax.service';
import {
  SimpleTaxCalculateDto,
  SimpleTaxPayPeriodDto,
  SimpleTaxUpdatePeriodDto,
} from './dto/simple-tax-period.dto';
import { UpsertSimpleTaxConfigDto } from './dto/simple-tax-config.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('tax/simple')
export class SimpleTaxController {
  constructor(private readonly simpleTaxService: SimpleTaxService) {}

  @Get('periods')
  listPeriods(@Req() req: any, @Query('taxYear') taxYear?: string) {
    return this.simpleTaxService.listPeriods(
      req.user.businessId,
      Number(taxYear || new Date().getFullYear()),
    );
  }

  @Get('periods/:id')
  getPeriod(@Req() req: any, @Param('id') id: string) {
    return this.simpleTaxService.getPeriod(req.user.businessId, id);
  }

  @Post('calculate')
  calculate(@Req() req: any, @Body() dto: SimpleTaxCalculateDto) {
    return this.simpleTaxService.calculateAndPersist(req.user.businessId, dto);
  }

  @Post('periods')
  createPeriod(@Req() req: any, @Body() dto: SimpleTaxCalculateDto) {
    return this.simpleTaxService.createPeriod(req.user.businessId, dto);
  }

  @Patch('periods/:id')
  updatePeriod(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SimpleTaxUpdatePeriodDto,
  ) {
    return this.simpleTaxService.updatePeriod(req.user.businessId, id, dto);
  }

  @Patch('periods/:id/post')
  postPeriod(@Req() req: any, @Param('id') id: string) {
    return this.simpleTaxService.postPeriod(req.user.businessId, id);
  }

  @Patch('periods/:id/pay')
  payPeriod(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SimpleTaxPayPeriodDto,
  ) {
    return this.simpleTaxService.payPeriod(req.user.businessId, id, dto);
  }
}

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('settings')
export class SimpleTaxSettingsController {
  constructor(private readonly simpleTaxService: SimpleTaxService) {}

  @Get('simple-tax-config')
  getConfig(@Req() req: any) {
    return this.simpleTaxService.getConfig(req.user.businessId);
  }

  @Put('simple-tax-config')
  upsertConfig(@Req() req: any, @Body() dto: UpsertSimpleTaxConfigDto) {
    return this.simpleTaxService.upsertConfig(req.user.businessId, dto);
  }

  @Get('simple-tax-rates')
  listRates(
    @Query('taxYear') taxYear?: string,
    @Query('periodType') periodType?: SimpleTaxPeriodType,
  ) {
    return this.simpleTaxService.listRates(
      Number(taxYear || new Date().getFullYear()),
      periodType || SimpleTaxPeriodType.BIMONTHLY,
    );
  }
}
