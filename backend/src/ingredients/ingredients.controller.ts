import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { ListIngredientsQueryDto } from './dto/list-ingredients.query.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpsertPurchasePresentationDto } from './dto/purchase-presentation.dto';
import { IngredientsService } from './ingredients.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateIngredientDto) {
    return this.ingredientsService.create(req.user.businessId, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ListIngredientsQueryDto) {
    return this.ingredientsService.findAll(req.user.businessId, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.ingredientsService.findOne(req.user.businessId, id);
  }

  @Get(':id/purchase-presentations')
  listPresentations(@Req() req: any, @Param('id') id: string) {
    return this.ingredientsService.listPurchasePresentations(req.user.businessId, id);
  }

  @Post(':id/purchase-presentations')
  createPresentation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertPurchasePresentationDto,
  ) {
    return this.ingredientsService.createPurchasePresentation(req.user.businessId, id, dto);
  }

  @Patch(':id/purchase-presentations/:presentationId')
  updatePresentation(
    @Req() req: any,
    @Param('id') id: string,
    @Param('presentationId') presentationId: string,
    @Body() dto: UpsertPurchasePresentationDto,
  ) {
    return this.ingredientsService.updatePurchasePresentation(req.user.businessId, id, presentationId, dto);
  }

  @Delete(':id/purchase-presentations/:presentationId')
  deactivatePresentation(
    @Req() req: any,
    @Param('id') id: string,
    @Param('presentationId') presentationId: string,
  ) {
    return this.ingredientsService.deactivatePurchasePresentation(req.user.businessId, id, presentationId);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.ingredientsService.update(req.user.businessId, id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Req() req: any, @Param('id') id: string) {
    return this.ingredientsService.deactivate(req.user.businessId, id);
  }

  @Patch(':id/reactivate')
  reactivate(@Req() req: any, @Param('id') id: string) {
    return this.ingredientsService.reactivate(req.user.businessId, id);
  }
}
