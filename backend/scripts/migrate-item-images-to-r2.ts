import { PrismaClient } from '@prisma/client';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migración de imágenes de Items a Cloudflare R2...');

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    console.error('Faltan variables de entorno para Cloudflare R2.');
    process.exit(1);
  }

  const s3Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  // Buscar ItemImages con Base64 y sin migrar
  const pendingImages = await prisma.itemImage.findMany({
    where: {
      objectKey: null,
      url: {
        startsWith: 'data:image/',
      },
    },
    include: {
      item: {
        select: {
          businessId: true,
        },
      },
    },
  });

  console.log(`Encontradas ${pendingImages.length} imágenes para migrar.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const image of pendingImages) {
    console.log(`Procesando imagen ID: ${image.id} (Item: ${image.itemId})`);

    let objectKeySubido: string | null = null;

    try {
      const match = image.url.match(
        /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i,
      );
      if (!match) {
        console.warn(
          `[!] Formato Base64 inválido para ID ${image.id}, saltando.`,
        );
        skippedCount++;
        continue;
      }

      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      const optimizedBuffer = await sharp(buffer)
        .rotate()
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();

      const objectKey = `businesses/${image.item.businessId}/products/${image.itemId}/${Date.now()}.webp`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: optimizedBuffer,
          ContentType: 'image/webp',
        }),
      );

      objectKeySubido = objectKey;

      const baseUrl = publicBaseUrl.replace(/\/+$/, '');
      const encodedKey = objectKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const publicUrl = `${baseUrl}/${encodedKey}`;

      await prisma.itemImage.update({
        where: { id: image.id },
        data: {
          objectKey,
          mimeType: 'image/webp',
          sizeBytes: optimizedBuffer.length,
          url: publicUrl,
        },
      });

      console.log(`[OK] Imagen ID ${image.id} migrada con éxito.`);
      migratedCount++;
    } catch (error) {
      console.error(
        `[ERROR] Falló la migración de la imagen ID ${image.id}:`,
        error,
      );
      errorCount++;

      // Rollback en R2
      if (objectKeySubido) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: objectKeySubido,
            }),
          );
          console.log(`[ROLLBACK] Objeto eliminado de R2: ${objectKeySubido}`);
        } catch (rollbackError) {
          console.error(
            `[ERROR FATAL] Falló rollback en R2 para ${objectKeySubido}:`,
            rollbackError,
          );
        }
      }
    }
  }

  console.log('\n=======================================');
  console.log('RESUMEN DE MIGRACIÓN');
  console.log(`Total encontradas: ${pendingImages.length}`);
  console.log(`Migradas: ${migratedCount}`);
  console.log(`Saltadas: ${skippedCount}`);
  console.log(`Errores: ${errorCount}`);
  console.log('=======================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
