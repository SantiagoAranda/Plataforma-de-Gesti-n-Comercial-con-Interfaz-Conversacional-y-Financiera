import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { ReplaceRecipeDto } from './dto/replace-recipe.dto';
import { RecipesService } from './recipes.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('items/:itemId/recipe')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  getForItem(@Req() req: any, @Param('itemId') itemId: string) {
    return this.recipesService.getForItem(req.user.businessId, itemId);
  }

  @Put()
  replaceForItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: ReplaceRecipeDto,
  ) {
    return this.recipesService.replaceForItem(req.user.businessId, itemId, dto);
  }
}
