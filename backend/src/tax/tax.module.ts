import { Module } from '@nestjs/common';
import { TaxService } from './tax.service';
import { TaxController } from './tax.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { FiscalLifecycleService } from './fiscal-lifecycle.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [TaxController],
  providers: [TaxService, FiscalLifecycleService],
  exports: [TaxService, FiscalLifecycleService],
})
export class TaxModule {}
