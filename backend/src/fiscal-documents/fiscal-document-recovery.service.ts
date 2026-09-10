import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FiscalDocumentService } from './fiscal-document.service';

@Injectable()
export class FiscalDocumentRecoveryService {
  private readonly logger = new Logger(FiscalDocumentRecoveryService.name);
  private running = false;

  constructor(private readonly fiscalDocuments: FiscalDocumentService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverOnSchedule() {
    if (this.running) {
      this.logger.warn('Fiscal recovery skipped because a previous cycle is still running');
      return;
    }

    this.running = true;
    try {
      const result = await this.fiscalDocuments.recoverPendingDocuments();
      this.logger.log(
        `Fiscal recovery cycle completed scanned=${result.scanned} eligible=${result.eligible}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Fiscal recovery cycle failed error=${String(error?.message ?? error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
