import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';
import { StorageModule } from '../storage/storage.module';
import { ExpenseReceiptsController } from './expense-receipts.controller';
import { ExpenseReceiptsService } from './expense-receipts.service';
import { LocalReceiptTempStorageService } from './local-receipt-temp-storage.service';
import { R2ReceiptTempStorageService } from './r2-receipt-temp-storage.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ReceiptParserService } from './receipt-parser.service';
import { ReceiptProcessingService } from './receipt-processing.service';
import { RECEIPT_TEMP_STORAGE } from './receipt-temp-storage.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ExpenseReceiptsController],
  providers: [
    ExpenseReceiptsService,
    ReceiptOcrService,
    ReceiptParserService,
    ReceiptProcessingService,
    {
      provide: RECEIPT_TEMP_STORAGE,
      inject: [ConfigService, StorageService],
      useFactory: (
        configService: ConfigService,
        storageService: StorageService,
      ) => {
        const mode =
          configService.get<string>('EXPENSE_RECEIPT_TEMP_STORAGE') || 'r2';

        if (mode === 'local') {
          return new LocalReceiptTempStorageService(configService);
        }

        if (mode === 'r2') {
          return new R2ReceiptTempStorageService(storageService);
        }

        throw new Error(
          'EXPENSE_RECEIPT_TEMP_STORAGE debe ser "local" o "r2"',
        );
      },
    },
  ],
})
export class ExpenseReceiptsModule {}
