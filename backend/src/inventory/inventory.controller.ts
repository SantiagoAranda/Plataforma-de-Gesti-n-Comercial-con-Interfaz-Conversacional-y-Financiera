import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryInitialDto } from './dto/create-inventory-initial.dto';
import { CreateInventoryPurchaseDto } from './dto/create-inventory-purchase.dto';
import { CreateInventoryPurchaseReturnDto } from './dto/create-inventory-purchase-return.dto';
import { InventoryKardexQueryDto } from './dto/inventory-kardex.query.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary.query.dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('initial')
  registerInitial(@Req() req: any, @Body() dto: CreateInventoryInitialDto) {
    return this.inventoryService.registerInitial(req.user.businessId, dto);
  }

  @Post('purchase')
  registerPurchase(@Req() req: any, @Body() dto: CreateInventoryPurchaseDto) {
    return this.inventoryService.registerPurchase(req.user.businessId, dto);
  }

  @Post('purchase-return')
  registerPurchaseReturn(
    @Req() req: any,
    @Body() dto: CreateInventoryPurchaseReturnDto,
  ) {
    return this.inventoryService.registerPurchaseReturn(req.user.businessId, dto);
  }

  @Post('adjustments/positive')
  registerPositiveAdjustment(
    @Req() req: any,
    @Body() dto: CreateInventoryAdjustmentDto,
  ) {
    return this.inventoryService.registerPositiveAdjustment(
      req.user.businessId,
      dto,
    );
  }

  @Post('adjustments/negative')
  registerNegativeAdjustment(
    @Req() req: any,
    @Body() dto: CreateInventoryAdjustmentDto,
  ) {
    return this.inventoryService.registerNegativeAdjustment(
      req.user.businessId,
      dto,
    );
  }

  @Get('summary')
  getSummary(@Req() req: any, @Query() query: InventorySummaryQueryDto) {
    return this.inventoryService.getSummary(req.user.businessId, query);
  }

  @Get('kardex/:ingredientId')
  listKardex(
    @Req() req: any,
    @Param('ingredientId') ingredientId: string,
    @Query() query: InventoryKardexQueryDto,
  ) {
    return this.inventoryService.listKardex(
      req.user.businessId,
      ingredientId,
      query,
    );
  }
}
