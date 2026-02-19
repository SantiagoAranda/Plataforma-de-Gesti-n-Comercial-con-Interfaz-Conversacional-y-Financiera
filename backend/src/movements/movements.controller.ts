import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

@Controller('movements')
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  create(@Req() req: any, @Body() dto: CreateMovementDto) {
    return this.movementsService.create(req.user.businessId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  findAll(@Req() req: any) {
    return this.movementsService.findAll(req.user.businessId);
  }
}
