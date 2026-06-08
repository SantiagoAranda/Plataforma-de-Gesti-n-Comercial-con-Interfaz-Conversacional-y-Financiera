import { Module } from '@nestjs/common';
import { RecipesBulkController, RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  controllers: [RecipesController, RecipesBulkController],
  providers: [RecipesService],
})
export class RecipesModule {}
