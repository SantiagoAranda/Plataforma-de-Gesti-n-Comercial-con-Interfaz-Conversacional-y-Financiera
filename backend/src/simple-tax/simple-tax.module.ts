import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  SimpleTaxController,
  SimpleTaxSettingsController,
} from './simple-tax.controller';
import { SimpleTaxService } from './simple-tax.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [SimpleTaxController, SimpleTaxSettingsController],
  providers: [SimpleTaxService],
  exports: [SimpleTaxService],
})
export class SimpleTaxModule {}
