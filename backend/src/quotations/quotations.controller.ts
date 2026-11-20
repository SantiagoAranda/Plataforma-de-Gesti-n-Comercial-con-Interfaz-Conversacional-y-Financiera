import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateQuotationDto) {
    return this.quotations.create(req.user.businessId, dto);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('status', new ParseEnumPipe(QuotationStatus, { optional: true }))
    status?: QuotationStatus,
  ) {
    return this.quotations.findAll(req.user.businessId, status);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.quotations.findOne(req.user.businessId, id);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotations.update(req.user.businessId, id, dto);
  }

  @Post(':id/send')
  send(@Req() req: any, @Param('id') id: string) {
    return this.quotations.transition(req.user.businessId, id, 'send');
  }

  @Post(':id/accept')
  accept(@Req() req: any, @Param('id') id: string) {
    return this.quotations.transition(req.user.businessId, id, 'accept');
  }

  @Post(':id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.quotations.transition(req.user.businessId, id, 'reject');
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.quotations.transition(req.user.businessId, id, 'cancel');
  }
}
