import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const MAX_SIGNED_DELIVERY_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const PDF_TYPE = 'application/pdf';

/**
 * Copia firmada de la orden de entrega: una por venta, reemplazable y removible.
 * Las fotos se normalizan a WebP; el PDF se guarda tal cual. Nada es público: se sirve por la API.
 */
@Injectable()
export class SignedDeliveriesService {
  private readonly logger = new Logger(SignedDeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** La venta debe ser del negocio: es la única barrera entre negocios. */
  private async assertOrder(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Venta no encontrada');
  }

  private view(row: {
    mimeType: string;
    sizeBytes: number;
    originalName: string | null;
    updatedAt: Date;
  }) {
    return {
      attached: true as const,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      originalName: row.originalName,
      updatedAt: row.updatedAt,
    };
  }

  async find(businessId: string, orderId: string) {
    await this.assertOrder(businessId, orderId);
    const row = await this.prisma.orderSignedDelivery.findUnique({
      where: { orderId },
    });
    return row ? this.view(row) : { attached: false as const };
  }

  async put(businessId: string, orderId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Selecciona la foto o el PDF firmado');
    if (file.size > MAX_SIGNED_DELIVERY_BYTES) {
      throw new BadRequestException('El archivo no puede superar los 10 MB');
    }
    await this.assertOrder(businessId, orderId);

    const mime = (file.mimetype || '').toLowerCase();
    let body: Buffer;
    let mimeType: string;
    let ext: string;
    if (mime === PDF_TYPE) {
      // El tipo lo declara el cliente: se comprueba la firma del archivo.
      if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new BadRequestException('El PDF no es válido');
      }
      body = file.buffer;
      mimeType = PDF_TYPE;
      ext = 'pdf';
    } else if (IMAGE_TYPES.has(mime)) {
      try {
        body = await sharp(file.buffer)
          .rotate()
          .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw new BadRequestException('No se pudo leer la imagen');
      }
      mimeType = 'image/webp';
      ext = 'webp';
    } else {
      throw new BadRequestException('Sube una foto (JPG, PNG, WEBP, HEIC) o un PDF');
    }

    const objectKey = `businesses/${businessId}/signed-deliveries/${orderId}/${Date.now()}.${ext}`;
    try {
      await this.storage.uploadObject({ objectKey, body, contentType: mimeType });
    } catch {
      throw new InternalServerErrorException('No se pudo guardar el archivo');
    }

    const previous = await this.prisma.orderSignedDelivery.findUnique({
      where: { orderId },
      select: { objectKey: true },
    });
    let row;
    try {
      row = await this.prisma.orderSignedDelivery.upsert({
        where: { orderId },
        create: {
          orderId,
          objectKey,
          mimeType,
          sizeBytes: body.length,
          originalName: file.originalname?.slice(0, 200) || null,
        },
        update: {
          objectKey,
          mimeType,
          sizeBytes: body.length,
          originalName: file.originalname?.slice(0, 200) || null,
        },
      });
    } catch (error) {
      await this.discard(objectKey);
      throw error;
    }
    if (previous && previous.objectKey !== objectKey) {
      await this.discard(previous.objectKey);
    }
    return this.view(row);
  }

  async file(businessId: string, orderId: string) {
    await this.assertOrder(businessId, orderId);
    const row = await this.prisma.orderSignedDelivery.findUnique({
      where: { orderId },
    });
    if (!row) throw new NotFoundException('Esta venta no tiene copia firmada');
    const { body } = await this.storage.downloadObject(row.objectKey);
    return { body, mimeType: row.mimeType, originalName: row.originalName };
  }

  async remove(businessId: string, orderId: string) {
    await this.assertOrder(businessId, orderId);
    const row = await this.prisma.orderSignedDelivery.findUnique({
      where: { orderId },
    });
    if (!row) return { attached: false as const };
    // Primero el archivo: si R2 falla, el registro sigue y se puede reintentar sin dejar huérfanos.
    try {
      await this.storage.deleteObject(row.objectKey);
    } catch {
      throw new InternalServerErrorException('No se pudo eliminar el archivo');
    }
    await this.prisma.orderSignedDelivery.delete({ where: { orderId } });
    return { attached: false as const };
  }

  private async discard(objectKey: string) {
    try {
      await this.storage.deleteObject(objectKey);
    } catch (error) {
      this.logger.error(`No se pudo borrar ${objectKey} de R2`, error as Error);
    }
  }
}
