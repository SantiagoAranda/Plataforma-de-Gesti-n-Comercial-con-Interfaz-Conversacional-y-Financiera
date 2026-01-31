import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BusinessesModule } from './businesses/businesses.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [AuthModule, UsersModule, BusinessesModule, ProductsModule, SalesModule, AccountingModule, ReservationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
