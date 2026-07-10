import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpsertTaxProfileDto } from './dto/upsert-tax-profile.dto';
import { ToggleTaxSettingsDto } from './dto/toggle-tax-settings.dto';
import { CreateIcaRateDto } from './dto/create-ica-rate.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('tax-profile')
  getTaxProfile(@Req() req: any) {
    return this.settingsService.getTaxProfile(req.user.businessId);
  }

  @Put('tax-profile')
  upsertTaxProfile(@Req() req: any, @Body() dto: UpsertTaxProfileDto) {
    return this.settingsService.upsertTaxProfile(req.user.businessId, dto);
  }

  @Patch('tax-profile/toggle')
  toggleTaxSettings(@Req() req: any, @Body() dto: ToggleTaxSettingsDto) {
    return this.settingsService.toggleTaxSettings(req.user.businessId, dto);
  }

  @Get('tax-responsibilities')
  listTaxResponsibilities() {
    return this.settingsService.listTaxResponsibilities();
  }

  @Get('economic-activities')
  listCiiu(@Query('search') search?: string) {
    return this.settingsService.listCiiu(search);
  }

  // --- ICA rates ---
  @Get('ica-rates')
  listIcaRates(@Req() req: any) {
    return this.settingsService.listIcaRates(req.user.businessId);
  }

  @Post('ica-rates')
  createIcaRate(@Req() req: any, @Body() dto: CreateIcaRateDto) {
    return this.settingsService.createIcaRate(req.user.businessId, dto);
  }

  @Patch('ica-rates/:id')
  updateIcaRate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateIcaRateDto>,
  ) {
    return this.settingsService.updateIcaRate(req.user.businessId, id, dto);
  }

  @Delete('ica-rates/:id')
  deleteIcaRate(@Req() req: any, @Param('id') id: string) {
    return this.settingsService.deleteIcaRate(req.user.businessId, id);
  }

  // --- Sales Tax Rules ---
  @Get('tax-rules')
  listTaxRules(@Req() req: any) {
    return this.settingsService.listTaxRules(req.user.businessId);
  }

  @Post('tax-rules')
  createTaxRule(@Req() req: any, @Body() dto: CreateTaxRuleDto) {
    return this.settingsService.createTaxRule(req.user.businessId, dto);
  }

  @Patch('tax-rules/:id')
  updateTaxRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTaxRuleDto>,
  ) {
    return this.settingsService.updateTaxRule(req.user.businessId, id, dto);
  }

  @Delete('tax-rules/:id')
  deleteTaxRule(@Req() req: any, @Param('id') id: string) {
    return this.settingsService.deleteTaxRule(req.user.businessId, id);
  }
}
