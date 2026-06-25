import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { TaxService } from './tax.service';
import { TaxPreviewDto } from './dto/tax-preview.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('sales')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Post('tax-preview')
  calculatePreview(@Req() req: any, @Body() dto: TaxPreviewDto) {
    return this.taxService.calculateTaxPreview(req.user.businessId, dto);
  }
}
