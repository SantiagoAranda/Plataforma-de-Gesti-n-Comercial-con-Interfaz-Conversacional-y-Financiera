import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryInitialDto } from './dto/create-inventory-initial.dto';
import { CreateInventoryPurchaseDto } from './dto/create-inventory-purchase.dto';
import { CreateInventoryPurchaseReturnDto } from './dto/create-inventory-purchase-return.dto';
import { InventoryKardexGlobalQueryDto } from './dto/inventory-kardex-global.query.dto';
import { InventoryKardexQueryDto } from './dto/inventory-kardex.query.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary.query.dto';
import { ReplaceServiceConsumptionDto } from './dto/replace-service-consumption.dto';
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

  @Post('items/:itemId/movements')
  registerItemMovement(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: (CreateInventoryInitialDto | CreateInventoryPurchaseDto) & {
      type: 'INVENTORY_INITIAL' | 'PURCHASE';
    },
  ) {
    if (dto.type === 'INVENTORY_INITIAL') {
      return this.inventoryService.registerInitial(req.user.businessId, {
        ...dto,
        itemId,
        ingredientId: undefined,
      } as CreateInventoryInitialDto);
    }

    return this.inventoryService.registerPurchase(req.user.businessId, {
      ...dto,
      itemId,
      ingredientId: undefined,
    } as CreateInventoryPurchaseDto);
  }

  @Post('purchase-return')
  registerPurchaseReturn(
    @Req() req: any,
    @Body() dto: CreateInventoryPurchaseReturnDto,
  ) {
    return this.inventoryService.registerPurchaseReturn(req.user.businessId, dto);
  }

  @Post('reconcile/:ingredientId')
  reconcileIngredient(
    @Req() req: any,
    @Param('ingredientId') ingredientId: string,
  ) {
    return this.inventoryService.reconcileIngredient(
      req.user.businessId,
      ingredientId,
    );
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

  @Get('units')
  listUnits() {
    return this.inventoryService.listUnits();
  }

  @Get('unit-conversions')
  listUnitConversions() {
    return this.inventoryService.listUnitConversions();
  }

  @Get('items/summary')
  getSimpleItemsSummary(@Req() req: any) {
    return this.inventoryService.getSimpleItemsSummary(req.user.businessId);
  }

  @Get('kardex')
  listGlobalKardex(@Req() req: any, @Query() query: InventoryKardexGlobalQueryDto) {
    return this.inventoryService.listGlobalKardex(req.user.businessId, query);
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

  @Get('items/:itemId/kardex')
  listItemKardex(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Query() query: InventoryKardexQueryDto,
  ) {
    return this.inventoryService.listItemKardex(
      req.user.businessId,
      itemId,
      query,
    );
  }

  @Get('services/consumption')
  listServiceConsumption(@Req() req: any) {
    return this.inventoryService.listServiceConsumption(req.user.businessId);
  }

  @Get('services/:serviceItemId/consumption')
  getServiceConsumption(
    @Req() req: any,
    @Param('serviceItemId') serviceItemId: string,
  ) {
    return this.inventoryService.getServiceConsumption(
      req.user.businessId,
      serviceItemId,
    );
  }

  @Put('services/:serviceItemId/consumption')
  replaceServiceConsumption(
    @Req() req: any,
    @Param('serviceItemId') serviceItemId: string,
    @Body() dto: ReplaceServiceConsumptionDto,
  ) {
    return this.inventoryService.replaceServiceConsumption(
      req.user.businessId,
      serviceItemId,
      dto,
    );
  }

  @Get('recipes/:itemId/consumption-history')
  getRecipeConsumptionHistory(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Query() query: { from?: string; to?: string; limit?: string },
  ) {
    return this.inventoryService.getRecipeConsumptionHistory(
      req.user.businessId,
      itemId,
      query,
    );
  }

  @Get('services/:serviceItemId/consumption-history')
  getServiceConsumptionHistory(
    @Req() req: any,
    @Param('serviceItemId') serviceItemId: string,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.inventoryService.getServiceConsumptionHistory(
      req.user.businessId,
      serviceItemId,
      query,
    );
  }
}
