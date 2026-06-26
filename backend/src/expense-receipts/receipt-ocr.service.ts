import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(private readonly configService: ConfigService) {}

  async extractText(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }) {
    const apiKey = this.configService.get<string>('OCR_SPACE_API_KEY');
    if (!apiKey) {
      throw new Error('OCR provider is not configured');
    }

    const form = new FormData();
    form.set(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
      input.filename,
    );
    form.set('language', 'spa');
    form.set('OCREngine', '2');
    form.set('scale', 'true');
    form.set('isTable', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: apiKey },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OCR provider returned ${response.status}`);
      }

      const payload: any = await response.json();
      const text = (payload?.ParsedResults ?? [])
        .map((result: any) => result?.ParsedText)
        .filter(Boolean)
        .join('\n')
        .trim();

      if (!text) {
        throw new Error(payload?.ErrorMessage?.[0] ?? 'OCR did not return text');
      }

      return text;
    } catch (error) {
      this.logger.warn(
        `OCR failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
