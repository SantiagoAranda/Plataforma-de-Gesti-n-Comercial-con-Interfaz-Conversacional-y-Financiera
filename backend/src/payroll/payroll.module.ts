import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [CommonModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
