import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { SignedDeliveriesService } from './signed-deliveries.service';

const A = 'biz-a';
const ORDER = 'order-1';

function make() {
  const rows = new Map<string, any>();
  const objects = new Map<string, Buffer>();
  const prisma = {
    order: {
      findFirst: async ({ where }: any) =>
        where.id === ORDER && where.businessId === A ? { id: ORDER } : null,
    },
    orderSignedDelivery: {
      findUnique: async ({ where }: any) => rows.get(where.orderId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const row = { ...(rows.get(where.orderId) ?? create), ...update, updatedAt: new Date() };
        rows.set(where.orderId, row);
        return row;
      },
      delete: async ({ where }: any) => void rows.delete(where.orderId),
    },
  };
  const storage = {
    uploadObject: jest.fn(async ({ objectKey, body }: any) => void objects.set(objectKey, body)),
    deleteObject: jest.fn(async (key: string) => void objects.delete(key)),
    downloadObject: jest.fn(async (key: string) => ({ body: objects.get(key) })),
  };
  return { service: new SignedDeliveriesService(prisma as any, storage as any), rows, objects, storage };
}

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } }).png().toBuffer();
const file = (buffer: Buffer, mimetype: string, originalname = 'f') =>
  ({ buffer, mimetype, size: buffer.length, originalname }) as Express.Multer.File;

describe('SignedDeliveriesService', () => {
  it('sin copia: attached false; con copia: la describe', async () => {
    const { service } = make();
    expect(await service.find(A, ORDER)).toEqual({ attached: false });
    await service.put(A, ORDER, file(await png(), 'image/png', 'firma.png'));
    expect(await service.find(A, ORDER)).toMatchObject({
      attached: true,
      mimeType: 'image/webp',
      originalName: 'firma.png',
    });
  });

  it('la foto se normaliza a WebP y queda bajo la carpeta privada del negocio', async () => {
    const { service, objects } = make();
    await service.put(A, ORDER, file(await png(), 'image/png'));
    const [[key, body]] = [...objects];
    expect(key).toMatch(/^businesses\/biz-a\/signed-deliveries\/order-1\/\d+\.webp$/);
    expect((await sharp(body).metadata()).format).toBe('webp');
  });

  it('el PDF se guarda tal cual; uno falso se rechaza', async () => {
    const { service, objects } = make();
    const pdf = Buffer.from('%PDF-1.4 contenido');
    await service.put(A, ORDER, file(pdf, 'application/pdf'));
    expect([...objects.values()][0]).toEqual(pdf);
    await expect(
      service.put(A, ORDER, file(Buffer.from('<script>'), 'application/pdf')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza tipos no permitidos, archivos vacíos y los muy grandes', async () => {
    const { service, storage } = make();
    await expect(service.put(A, ORDER, file(Buffer.from('x'), 'text/html'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.put(A, ORDER, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.put(A, ORDER, { ...file(Buffer.from('x'), 'image/png'), size: 11 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.put(A, ORDER, file(Buffer.from('no es imagen'), 'image/png'))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('una venta de otro negocio no existe para este', async () => {
    const { service } = make();
    await expect(service.find('biz-b', ORDER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.put('biz-b', ORDER, file(await png(), 'image/png'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('biz-b', ORDER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reemplazar deja un solo archivo en R2; quitar lo borra todo', async () => {
    const { service, objects, rows } = make();
    await service.put(A, ORDER, file(await png(), 'image/png'));
    const first = [...objects.keys()][0];
    await new Promise((r) => setTimeout(r, 5)); // otra marca de tiempo en la clave
    await service.put(A, ORDER, file(Buffer.from('%PDF-1.7 x'), 'application/pdf'));
    expect(objects.size).toBe(1);
    expect(objects.has(first)).toBe(false);
    expect(rows.get(ORDER).mimeType).toBe('application/pdf');

    expect(await service.remove(A, ORDER)).toEqual({ attached: false });
    expect(objects.size).toBe(0);
    expect(rows.size).toBe(0);
    expect(await service.remove(A, ORDER)).toEqual({ attached: false });
  });

  it('descarga el archivo guardado y 404 si no hay', async () => {
    const { service } = make();
    await expect(service.file(A, ORDER)).rejects.toBeInstanceOf(NotFoundException);
    const pdf = Buffer.from('%PDF-1.4 x');
    await service.put(A, ORDER, file(pdf, 'application/pdf'));
    const out = await service.file(A, ORDER);
    expect(out.body).toEqual(pdf);
    expect(out.mimeType).toBe('application/pdf');
  });
});
