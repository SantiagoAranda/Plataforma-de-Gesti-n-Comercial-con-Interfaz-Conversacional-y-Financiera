import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { ItemsModule } from './items/items.module';
import { SalesModule } from './sales/sales.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PublicModule } from './public/public.module';
import { MovementsModule } from './movements/movements.module';
import { AccountingModule } from './accounting/accounting.module';

import { IngredientsModule } from './ingredients/ingredients.module';
import { RecipesModule } from './recipes/recipes.module';
import { InventoryModule } from './inventory/inventory.module';
import { PayrollModule } from './payroll/payroll.module';
import { ItemOptionsModule } from './item-options/item-options.module';
import { SettingsModule } from './settings/settings.module';
import { TaxModule } from './tax/tax.module';
import { SimpleTaxModule } from './simple-tax/simple-tax.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    BusinessesModule,
    CommonModule,
    PrismaModule,
    ItemsModule,
    SalesModule,
    ReservationsModule,
    PublicModule,
    MovementsModule,
    AccountingModule,
    IngredientsModule,
    RecipesModule,
    InventoryModule,
    PayrollModule,
    ItemOptionsModule,
    SettingsModule,
    TaxModule,
    SimpleTaxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
