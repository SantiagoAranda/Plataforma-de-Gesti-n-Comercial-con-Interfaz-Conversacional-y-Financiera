import { Prisma } from '@prisma/client';
import { QuotationsService, quotationLabel } from './quotations.service';

const D = (n: number | string) => new Prisma.Decimal(n);
const A = 'business-a';
const B = 'business-b';
const KEY = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, any>;

/**
 * Prisma en memoria con solo lo que usa el servicio. Si el servicio tocara pedidos,
 * inventario o contabilidad, el acceso a `prisma.order` & co. fallaría: la cotización no tiene efectos.
 */
function fakePrisma(items: Row[] = []) {
  const quotations: Row[] = [];
  let seq = 0;
  const withItems = (q: Row) => ({
    ...q,
    items: [...q.items].sort((a, b) => a.position - b.position),
  });
  const unique = (data: Row) => {
    const dup = quotations.find(
      (q) =>
        q.businessId === data.businessId &&
        (q.number === data.number ||
          (data.requestKeyHash && q.requestKeyHash === data.requestKeyHash)),
    );
    if (dup) {
      const target =
        dup.number === data.number
          ? ['businessId', 'number']
          : ['businessId', 'requestKeyHash'];
      throw Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target },
      });
    }
  };
  const prisma: any = {
    quotations,
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(async () => []),
    $transaction: async (cb: (tx: any) => unknown) => cb(prisma),
    item: {
      findMany: async ({ where }: any) =>
        items.filter(
          (i) =>
            where.id.in.includes(i.id) &&
            i.businessId === where.businessId &&
            i.status === where.status,
        ),
    },
    quotation: {
      findUnique: async ({ where }: any) => {
        const k = where.businessId_requestKeyHash;
        const q = quotations.find(
          (x) =>
            x.businessId === k.businessId &&
            x.requestKeyHash === k.requestKeyHash,
        );
        return q ? withItems(q) : null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        let rows = quotations.filter(
          (q) =>
            q.businessId === where.businessId &&
            (!where.id || q.id === where.id),
        );
        if (orderBy?.number === 'desc')
          rows = [...rows].sort((a, b) => b.number - a.number);
        return rows[0] ? withItems(rows[0]) : null;
      },
      findMany: async ({ where }: any) =>
        quotations
          .filter(
            (q) =>
              q.businessId === where.businessId &&
              (!where.status || q.status === where.status),
          )
          .map(withItems),
      create: async ({ data }: any) => {
        unique(data);
        const { items: nested, ...rest } = data;
        const row = {
          id: `q-${++seq}`,
          publicToken: `t-${seq}`,
          status: 'OPEN',
          currency: 'COP',
          sentAt: null,
          acceptedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          convertedAt: null,
          customerName: null,
          customerWhatsapp: null,
          customerEmail: null,
          customerDocument: null,
          note: null,
          requestKeyHash: null,
          requestFingerprint: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...rest,
          items: nested.create.map((i: Row, n: number) => ({
            id: `i-${seq}-${n}`,
            ...i,
          })),
        };
        quotations.push(row);
        return withItems(row);
      },
      update: async ({ where, data }: any) => {
        const row = quotations.find((q) => q.id === where.id)!;
        const { items: nested, ...rest } = data;
        Object.assign(row, rest);
        if (nested?.create)
          row.items = nested.create.map((i: Row, n: number) => ({
            id: `n-${n}`,
            ...i,
          }));
        return withItems(row);
      },
    },
    quotationItem: { deleteMany: async () => ({ count: 0 }) },
  };
  return prisma;
}

const item = (over: Row = {}) => ({
  id: 'p1',
  businessId: A,
  status: 'ACTIVE',
  name: 'Vinilo',
  price: D(58000),
  publishWithoutPrice: false,
  includeInQuotation: false,
  quotationDescription: null,
  ...over,
});
const line = (over: Row = {}) => ({ itemId: 'p1', quantity: 2, ...over });
const make = (items: Row[] = [item()], tax?: any) => {
  const prisma = fakePrisma(items);
  return { prisma, service: new QuotationsService(prisma, tax) };
};

describe('QuotationsService', () => {
  describe('creación', () => {
    it('numera consecutivo por negocio, con candado y sin saltos', async () => {
      const { service, prisma } = make([
        item(),
        item({ id: 'p2', businessId: B }),
      ]);
      const a1 = await service.create(A, { items: [line()] });
      const a2 = await service.create(A, { items: [line()] });
      const b1 = await service.create(B, { items: [line({ itemId: 'p2' })] });
      expect([a1.number, a2.number, b1.number]).toEqual([1, 2, 1]);
      expect(a1.displayNumber).toBe(quotationLabel(1));
      expect(a1.displayNumber).toBe('COT-0001');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    });

    it('usa el precio del catálogo, suma el subtotal y vigencia de 15 días', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-19T15:00:00Z'));
      try {
        const { service } = make();
        const q = await service.create(A, {
          items: [line({ quantity: 3 })],
          customerName: '  Ana ',
        });
        expect(q.items[0]).toMatchObject({
          name: 'Vinilo',
          unitPrice: 58000,
          lineTotal: 174000,
        });
        expect(q).toMatchObject({
          subtotal: 174000,
          taxTotal: 0,
          total: 174000,
          status: 'OPEN',
          validityDays: 15,
          expired: false,
        });
        expect(q.customer.name).toBe('Ana');
        expect(q.validUntil.toISOString()).toBe('2026-12-04T15:00:00.000Z');
      } finally {
        jest.useRealTimers();
      }
    });

    it('un producto con precio oculto va como «consultar precio» y no suma; el precio explícito sí', async () => {
      const { service } = make([item({ publishWithoutPrice: true })]);
      const hidden = await service.create(A, { items: [line()] });
      expect(hidden.items[0].unitPrice).toBeNull();
      expect(hidden.items[0].lineTotal).toBeNull();
      expect(hidden.total).toBe(0);
      const priced = await service.create(A, {
        items: [line({ unitPrice: 70000 })],
      });
      expect(priced.items[0].unitPrice).toBe(70000);
      expect(priced.total).toBe(140000);
      const forced = await service.create(A, {
        items: [{ quantity: 1, name: 'Servicio libre', unitPrice: null }],
      });
      expect(forced.items[0]).toMatchObject({
        itemId: null,
        name: 'Servicio libre',
        unitPrice: null,
      });
    });

    it('la descripción del catálogo solo entra con includeInQuotation; la escrita manda', async () => {
      const text = 'Rinde 40 m² por galón';
      const off = make([item({ quotationDescription: text })]);
      expect(
        (await off.service.create(A, { items: [line()] })).items[0].description,
      ).toBeNull();
      const on = make([
        item({ quotationDescription: text, includeInQuotation: true }),
      ]);
      expect(
        (await on.service.create(A, { items: [line()] })).items[0].description,
      ).toBe(text);
      expect(
        (await on.service.create(A, { items: [line({ description: 'Otra' })] }))
          .items[0].description,
      ).toBe('Otra');
    });

    it('rechaza productos inexistentes, inactivos o de otro negocio, y líneas sin nombre', async () => {
      const { service } = make([
        item({ id: 'p9', businessId: B }),
        item({ id: 'p8', status: 'INACTIVE' }),
      ]);
      for (const itemId of ['nope', 'p9', 'p8']) {
        await expect(
          service.create(A, { items: [line({ itemId })] }),
        ).rejects.toMatchObject({
          response: { code: 'QUOTATION_ITEM_NOT_FOUND', itemIds: [itemId] },
        });
      }
      await expect(
        service.create(A, { items: [{ quantity: 1 }] }),
      ).rejects.toMatchObject({
        response: { code: 'QUOTATION_LINE_NAME_REQUIRED' },
      });
    });

    it('suma el IVA estimado; si el cálculo falla, la cotización se crea con 0', async () => {
      const tax = {
        calculateTaxPreview: jest.fn(async () => ({
          vatTotal: D(22040),
          impoconsumoTotal: D(0),
        })),
      };
      const ok = make([item()], tax);
      const q = await ok.service.create(A, { items: [line()] });
      expect(q).toMatchObject({
        subtotal: 116000,
        taxTotal: 22040,
        total: 138040,
      });
      expect(tax.calculateTaxPreview).toHaveBeenCalledWith(
        A,
        expect.objectContaining({
          buyerIsRetenedor: false,
          cartItems: [{ itemId: 'p1', quantity: 2, unitPrice: 58000 }],
        }),
      );

      const broken = make([item()], {
        calculateTaxPreview: jest.fn(async () => {
          throw new Error('sin perfil fiscal');
        }),
      });
      expect(
        (await broken.service.create(A, { items: [line()] })).taxTotal,
      ).toBe(0);
    });

    it('nunca expone la clave ni la huella de idempotencia', async () => {
      const { service } = make();
      const q = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      expect(JSON.stringify(q)).not.toMatch(
        /requestKeyHash|requestFingerprint/,
      );
    });
  });

  describe('idempotencia', () => {
    it('el mismo reintento devuelve la misma cotización sin duplicarla', async () => {
      const { service, prisma } = make();
      const first = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      const again = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      expect(again.id).toBe(first.id);
      expect(prisma.quotations).toHaveLength(1);
    });

    it('la misma clave con otro contenido es un conflicto', async () => {
      const { service } = make();
      await service.create(A, { items: [line()], idempotencyKey: KEY });
      await expect(
        service.create(A, {
          items: [line({ quantity: 9 })],
          idempotencyKey: KEY,
        }),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    });

    it('la misma clave en otro negocio no choca', async () => {
      const { service } = make([item(), item({ businessId: B })]);
      const a = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      const b = await service.create(B, {
        items: [line()],
        idempotencyKey: KEY,
      });
      expect(b.id).not.toBe(a.id);
    });

    it('dos solicitudes simultáneas con la misma clave terminan en una sola cotización', async () => {
      const { service, prisma } = make();
      const real = prisma.quotation.findUnique;
      // La 1.ª solicitud ya creó la fila cuando la 2.ª llega al insert, pero su lectura previa no la vio.
      const winner = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      let reads = 0;
      prisma.quotation.findUnique = async (args: any) =>
        reads++ === 0 ? null : real(args);
      const loser = await service.create(A, {
        items: [line()],
        idempotencyKey: KEY,
      });
      expect(loser.id).toBe(winner.id);
      expect(prisma.quotations).toHaveLength(1);
    });
  });

  describe('ciclo de vida', () => {
    const open = async (items?: Row[]) => {
      const ctx = make(items);
      const q = await ctx.service.create(A, { items: [line()] });
      return { ...ctx, id: q.id };
    };

    it('enviar es idempotente y no cambia el estado', async () => {
      const { service, id } = await open();
      const sent = await service.transition(A, id, 'send');
      expect(sent.status).toBe('OPEN');
      expect(sent.sentAt).toBeInstanceOf(Date);
      const again = await service.transition(A, id, 'send');
      expect(again.sentAt).toEqual(sent.sentAt);
    });

    it('aceptar fija la fecha, repetir no escribe, y ya no se puede rechazar', async () => {
      const { service, id } = await open();
      const accepted = await service.transition(A, id, 'accept');
      expect(accepted).toMatchObject({ status: 'ACCEPTED' });
      expect((await service.transition(A, id, 'accept')).acceptedAt).toEqual(
        accepted.acceptedAt,
      );
      await expect(service.transition(A, id, 'reject')).rejects.toMatchObject({
        response: { code: 'QUOTATION_INVALID_TRANSITION', status: 'ACCEPTED' },
      });
    });

    it('rechazar y cancelar siguen las reglas; los estados finales no se mueven', async () => {
      const r = await open();
      await r.service.transition(A, r.id, 'reject');
      await expect(
        r.service.transition(A, r.id, 'accept'),
      ).rejects.toMatchObject({
        response: { code: 'QUOTATION_INVALID_TRANSITION' },
      });
      await expect(
        r.service.transition(A, r.id, 'cancel'),
      ).rejects.toMatchObject({
        response: { code: 'QUOTATION_INVALID_TRANSITION' },
      });

      const c = await open();
      await c.service.transition(A, c.id, 'accept');
      expect((await c.service.transition(A, c.id, 'cancel')).status).toBe(
        'CANCELLED',
      );
      expect((await c.service.transition(A, c.id, 'cancel')).status).toBe(
        'CANCELLED',
      );
    });

    it('una cotización vencida no se envía ni se acepta, pero se puede rechazar o cancelar', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-19T15:00:00Z'));
      try {
        const { service, id } = await open();
        jest.setSystemTime(new Date('2026-12-10T15:00:00Z'));
        expect((await service.findOne(A, id)).expired).toBe(true);
        await expect(service.transition(A, id, 'accept')).rejects.toMatchObject(
          { response: { code: 'QUOTATION_EXPIRED' } },
        );
        await expect(service.transition(A, id, 'send')).rejects.toMatchObject({
          response: { code: 'QUOTATION_EXPIRED' },
        });
        expect((await service.transition(A, id, 'reject')).status).toBe(
          'REJECTED',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('editar una vencida con nueva vigencia la reactiva; editar devuelve a «no enviada»', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-19T15:00:00Z'));
      try {
        const { service, id } = await open();
        await service.transition(A, id, 'send');
        jest.setSystemTime(new Date('2026-12-10T15:00:00Z'));
        const revived = await service.update(A, id, { validityDays: 10 });
        expect(revived).toMatchObject({
          expired: false,
          sentAt: null,
          validityDays: 10,
        });
        expect(revived.validUntil.toISOString()).toBe(
          '2026-12-20T15:00:00.000Z',
        );
        expect((await service.transition(A, id, 'accept')).status).toBe(
          'ACCEPTED',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('editar líneas recalcula totales; solo se edita lo vigente', async () => {
      const { service, id } = await open();
      const edited = await service.update(A, id, {
        items: [line({ quantity: 5 })],
        note: ' nota ',
      });
      expect(edited).toMatchObject({
        subtotal: 290000,
        total: 290000,
        note: 'nota',
      });
      await service.transition(A, id, 'accept');
      await expect(service.update(A, id, { note: 'x' })).rejects.toMatchObject({
        response: { code: 'QUOTATION_NOT_EDITABLE', status: 'ACCEPTED' },
      });
    });

    it('cada acción bloquea la fila antes de leerla', async () => {
      const { service, prisma, id } = await open();
      prisma.$queryRaw.mockClear();
      await service.transition(A, id, 'send');
      await service.update(A, id, { note: 'a' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('aislamiento por negocio', () => {
    it('otro negocio no ve, edita ni transiciona una cotización ajena', async () => {
      const { service } = make();
      const q = await service.create(A, { items: [line()] });
      await expect(service.findOne(B, q.id)).rejects.toMatchObject({
        response: { code: 'QUOTATION_NOT_FOUND' },
      });
      await expect(service.transition(B, q.id, 'accept')).rejects.toMatchObject(
        { response: { code: 'QUOTATION_NOT_FOUND' } },
      );
      await expect(
        service.update(B, q.id, { note: 'x' }),
      ).rejects.toMatchObject({ response: { code: 'QUOTATION_NOT_FOUND' } });
      expect(await service.findAll(B)).toEqual([]);
      expect(await service.findAll(A)).toHaveLength(1);
    });

    it('filtra por estado', async () => {
      const { service } = make();
      const a = await service.create(A, { items: [line()] });
      await service.create(A, { items: [line()] });
      await service.transition(A, a.id, 'accept');
      expect((await service.findAll(A, 'ACCEPTED')).map((q) => q.id)).toEqual([
        a.id,
      ]);
      expect(await service.findAll(A, 'OPEN')).toHaveLength(1);
    });
  });
});
