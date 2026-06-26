import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
  extensionForReceiptMime,
  PutTempReceiptInput,
  PutTempReceiptResult,
  ReceiptTempStorageService,
} from './receipt-temp-storage.service';

@Injectable()
export class R2ReceiptTempStorageService implements ReceiptTempStorageService {
  constructor(private readonly storage: StorageService) {
    this.storage.assertConfigured();
  }

  async putTempReceipt(
    input: PutTempReceiptInput,
  ): Promise<PutTempReceiptResult> {
    const extension = extensionForReceiptMime(input.mimeType);
    const key = `tmp/expense-receipts/${input.businessId}/${input.receiptId}.${extension}`;

    await this.storage.uploadObject({
      objectKey: key,
      body: input.buffer,
      contentType: input.mimeType,
    });

    return {
      key,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  getTempReceiptBuffer(key: string): Promise<Buffer> {
    return this.storage.getObjectBuffer(key);
  }

  async deleteTempReceipt(key?: string | null): Promise<void> {
    if (!key) return;
    await this.storage.deleteObject(key);
  }

  async cleanupExpiredTempObjects(
    _maxAgeMinutes: number,
    keys: string[] = [],
  ): Promise<void> {
    await Promise.all(
      keys.map((key) => this.storage.deleteObject(key).catch(() => undefined)),
    );
  }
}
