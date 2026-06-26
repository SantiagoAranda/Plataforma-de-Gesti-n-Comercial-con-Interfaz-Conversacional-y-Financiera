import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

type UploadObjectParams = {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly publicBaseUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );

    this.bucket = this.configService.get<string>('R2_BUCKET');
    this.publicBaseUrl = this.configService.get<string>('R2_PUBLIC_BASE_URL');

    this.client =
      endpoint && accessKeyId && secretAccessKey
        ? new S3Client({
            region: 'auto',
            endpoint,
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          })
        : null;
  }

  async uploadObject(params: UploadObjectParams) {
    const client = this.getClient();
    const bucket = this.getBucket();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async deleteObject(objectKey: string) {
    const client = this.getClient();
    const bucket = this.getBucket();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  }

  async getObjectBuffer(objectKey: string) {
    const client = this.getClient();
    const bucket = this.getBucket();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    const body = response.Body;
    if (!body) return Buffer.alloc(0);

    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    if (body instanceof Uint8Array) return Buffer.from(body);

    const webStream = body as ReadableStream<Uint8Array>;
    const reader = webStream.getReader();
    const chunks: Buffer[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
  }

  getPublicUrl(objectKey: string) {
    if (!this.publicBaseUrl) {
      throw new InternalServerErrorException(
        'R2_PUBLIC_BASE_URL no esta configurado',
      );
    }

    const baseUrl = this.publicBaseUrl.replace(/\/+$/, '');
    const encodedKey = objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${baseUrl}/${encodedKey}`;
  }

  assertConfigured() {
    this.getClient();
    this.getBucket();
  }

  private getClient() {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Cloudflare R2 no esta configurado',
      );
    }

    return this.client;
  }

  private getBucket() {
    if (!this.bucket) {
      throw new InternalServerErrorException('R2_BUCKET no esta configurado');
    }

    return this.bucket;
  }
}
