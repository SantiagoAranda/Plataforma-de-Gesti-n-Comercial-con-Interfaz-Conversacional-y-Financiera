import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentService } from './fiscal-document.service';
import { FiscalDocumentRecoveryService } from './fiscal-document-recovery.service';
import { FactusProvider } from './providers/factus.provider';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [FiscalDocumentsController],
  providers: [
    FiscalDocumentService,
    FiscalDocumentRecoveryService,
    FactusProvider,
  ],
  exports: [FiscalDocumentService],
})
export class FiscalDocumentsModule {}
