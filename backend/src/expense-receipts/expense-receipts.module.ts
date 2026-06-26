import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ExpenseReceiptsController } from './expense-receipts.controller';
import { ExpenseReceiptsService } from './expense-receipts.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ReceiptParserService } from './receipt-parser.service';
import { ReceiptProcessingService } from './receipt-processing.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ExpenseReceiptsController],
  providers: [
    ExpenseReceiptsService,
    ReceiptOcrService,
    ReceiptParserService,
    ReceiptProcessingService,
  ],
})
export class ExpenseReceiptsModule {}
