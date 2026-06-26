export const RECEIPT_TEMP_STORAGE = Symbol('RECEIPT_TEMP_STORAGE');

export type PutTempReceiptInput = {
  businessId: string;
  receiptId: string;
  buffer: Buffer;
  mimeType: string;
};

export type PutTempReceiptResult = {
  key: string;
  expiresAt: Date;
};

export interface ReceiptTempStorageService {
  putTempReceipt(input: PutTempReceiptInput): Promise<PutTempReceiptResult>;
  getTempReceiptBuffer(key: string): Promise<Buffer>;
  deleteTempReceipt(key?: string | null): Promise<void>;
  cleanupExpiredTempObjects(
    maxAgeMinutes: number,
    keys?: string[],
  ): Promise<void>;
}

export function extensionForReceiptMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}
