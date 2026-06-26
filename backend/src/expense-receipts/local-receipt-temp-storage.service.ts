import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import {
  extensionForReceiptMime,
  PutTempReceiptInput,
  PutTempReceiptResult,
  ReceiptTempStorageService,
} from './receipt-temp-storage.service';

@Injectable()
export class LocalReceiptTempStorageService
  implements ReceiptTempStorageService
{
  private readonly logger = new Logger(LocalReceiptTempStorageService.name);
  private readonly baseDir: string;

  constructor(private readonly configService: ConfigService) {
    this.baseDir = resolve(
      this.configService.get<string>('EXPENSE_RECEIPT_LOCAL_TMP_DIR') ||
        './tmp/expense-receipts',
    );
  }

  async putTempReceipt(
    input: PutTempReceiptInput,
  ): Promise<PutTempReceiptResult> {
    const extension = extensionForReceiptMime(input.mimeType);
    const key = `${this.safeSegment(input.businessId)}/${this.safeSegment(
      input.receiptId,
    )}-${randomUUID()}.${extension}`;
    const filePath = this.resolveKey(key);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer);

    return {
      key,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async getTempReceiptBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async deleteTempReceipt(key?: string | null): Promise<void> {
    if (!key) return;

    try {
      await rm(this.resolveKey(key), { force: true });
    } catch (error) {
      this.logger.warn(
        `Could not delete local receipt temp file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async cleanupExpiredTempObjects(maxAgeMinutes: number): Promise<void> {
    const threshold = Date.now() - maxAgeMinutes * 60 * 1000;
    await this.deleteExpiredFiles(this.baseDir, threshold);
  }

  private async deleteExpiredFiles(directory: string, threshold: number) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(directory, entry.name);
        if (!this.isInsideBase(fullPath)) return;

        if (entry.isDirectory()) {
          await this.deleteExpiredFiles(fullPath, threshold);
          await rm(fullPath, { recursive: false, force: true }).catch(
            () => undefined,
          );
          return;
        }

        const metadata = await stat(fullPath).catch(() => null);
        if (metadata && metadata.mtimeMs < threshold) {
          await rm(fullPath, { force: true }).catch(() => undefined);
        }
      }),
    );
  }

  private resolveKey(key: string) {
    if (!key || resolve(key) === key || key.includes('\\')) {
      throw new BadRequestException('Invalid temporary receipt key');
    }

    const target = resolve(this.baseDir, key);
    if (!this.isInsideBase(target)) {
      throw new BadRequestException('Invalid temporary receipt key');
    }

    return target;
  }

  private isInsideBase(target: string) {
    const resolvedBase = this.baseDir.endsWith(sep)
      ? this.baseDir
      : `${this.baseDir}${sep}`;
    const resolvedTarget = resolve(target);
    return resolvedTarget === this.baseDir || resolvedTarget.startsWith(resolvedBase);
  }

  private safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }
}
