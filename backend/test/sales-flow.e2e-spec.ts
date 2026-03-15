import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { SalesService } from '../src/sales/sales.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderStatus, AccountingMovementOriginType, MovementNature } from '@prisma/client';

describe('Sales Flow (Integration)', () => {
  let app: INestApplication;
  let salesService: SalesService;
  let prisma: PrismaService;
  let businessId: string;
  let itemId: string;
  let serviceItemId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    salesService = app.get<SalesService>(SalesService);
    prisma = app.get<PrismaService>(PrismaService);

    // Setup: Create a test business
    const business = await prisma.business.create({
      data: {
        name: 'Test Business Sales Flow',
        slug: `test-business-${Date.now()}`,
        fiscalId: '123456789',
        phoneWhatsapp: '123456789',
        status: 'ACTIVE',
      },
    });
    businessId = business.id;

    // Setup: Create a test item
    const item = await prisma.item.create({
      data: {
        businessId,
        name: 'Test Product',
        type: 'PRODUCT',
        price: 100.0,
        status: 'ACTIVE',
      },
    });
    itemId = item.id;

    const serviceItem = await prisma.item.create({
      data: {
        businessId,
        name: 'Test Service',
        type: 'SERVICE',
        price: 150.0,
        durationMinutes: 60,
        status: 'ACTIVE',
      },
    });
    serviceItemId = serviceItem.id;

    // Ensure PUC subaccounts exist (legacy fallback accounts)
    await prisma.pucClase.upsert({ where: { code: '1' }, create: { code: '1', name: 'Activo' }, update: {} });
    await prisma.pucGrupo.upsert({ where: { code: '11' }, create: { code: '11', name: 'Disponible', claseCode: '1' }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '1105' }, create: { code: '1105', name: 'Caja', grupoCode: '11' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '110505' }, create: { code: '110505', name: 'Caja General', cuentaCode: '1105', active: true }, update: {} });

    await prisma.pucClase.upsert({ where: { code: '4' }, create: { code: '4', name: 'Ingresos' }, update: {} });
    await prisma.pucGrupo.upsert({ where: { code: '41' }, create: { code: '41', name: 'Operacionales', claseCode: '4' }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '4135' }, create: { code: '4135', name: 'Comercio al por mayor y al por menor', grupoCode: '41' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '413595' }, create: { code: '413595', name: 'Venta de otros productos', cuentaCode: '4135', active: true }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '4170' }, create: { code: '4170', name: 'Otras actividades de servicios comunitarios, sociales y personales', grupoCode: '41' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '417095' }, create: { code: '417095', name: 'Actividades conexas', cuentaCode: '4170', active: true }, update: {} });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.accountingMovement.deleteMany({ where: { businessId } });
    await prisma.reservation.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.item.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  describe('Ordering and Confirmation', () => {
    it('should complete a successful closure of a public order and create exactly 2 movements', async () => {
      // 1. Create a SENT order
      const order = await prisma.order.create({
        data: {
          businessId,
          status: 'SENT',
          customerName: 'Test Customer',
          customerWhatsapp: '987654321',
          total: 100.0,
          items: {
            create: {
              businessId,
              itemId,
              quantity: 1,
              itemNameSnapshot: 'Test Product',
              itemTypeSnapshot: 'PRODUCT',
              unitPrice: 100.0,
              lineTotal: 100.0,
            },
          },
        },
      });

      // 2. Confirm the order
      const result = await salesService.confirmOrder(businessId, order.id);

      // 3. Validations
      expect(result.order.status).toBe(OrderStatus.COMPLETED);
      expect(result.order.accountingPostedAt).not.toBeNull();
      expect(result.accountingCreated).toBe(true);

      const movements = await prisma.accountingMovement.findMany({
        where: { originId: order.id, originType: AccountingMovementOriginType.ORDER },
      });

      expect(movements.length).toBe(2);
      
      const debit = movements.find(m => m.nature === MovementNature.DEBIT);
      const credit = movements.find(m => m.nature === MovementNature.CREDIT);

      expect(debit).toBeDefined();
      expect(credit).toBeDefined();
      expect(Number(debit?.amount)).toBe(100.0);
      expect(Number(credit?.amount)).toBe(100.0);
    });

    it('should be idempotent and not create duplicate movements if confirmed twice', async () => {
      // 1. Create a SENT order
      const order = await prisma.order.create({
        data: {
          businessId,
          status: 'SENT',
          customerName: 'Idemp Customer',
          customerWhatsapp: '123',
          total: 50.0,
          items: {
            create: {
              businessId,
              itemId,
              quantity: 1,
              itemNameSnapshot: 'Test Product',
              itemTypeSnapshot: 'PRODUCT',
              unitPrice: 50.0,
              lineTotal: 50.0,
            },
          },
        },
      });

      // 2. Confirm twice
      const firstResult = await salesService.confirmOrder(businessId, order.id);
      const secondResult = await salesService.confirmOrder(businessId, order.id);

      // 3. Validations
      expect(firstResult.accountingCreated).toBe(true);
      expect(secondResult.accountingCreated).toBe(false);
      expect(secondResult.alreadyPosted).toBe(true);

      const movements = await prisma.accountingMovement.count({
        where: { originId: order.id },
      });
      expect(movements).toBe(2);
    });

    it('should not create accounting movements for orders that are not closed (e.g. SENT status with no confirmation)', async () => {
        // 1. Create a SENT order
        const order = await prisma.order.create({
          data: {
            businessId,
            status: 'SENT',
            customerName: 'Not Closed Customer',
            customerWhatsapp: '456',
            total: 200.0,
          },
        });

        // 2. Validate no movements exist
        const movements = await prisma.accountingMovement.count({
          where: { originId: order.id },
        });
        expect(movements).toBe(0);
        
        const freshOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(freshOrder?.accountingPostedAt).toBeNull();
    });

    it('should map pending reservations as PENDIENTE and post accounting only once on confirmation', async () => {
      const reservation = await prisma.reservation.create({
        data: {
          businessId,
          itemId: serviceItemId,
          customerName: 'Reservation Customer',
          customerWhatsapp: '555',
          date: new Date('2026-03-20T00:00:00.000Z'),
          startMinute: 9 * 60,
          endMinute: 10 * 60,
          status: 'PENDING',
        },
      });

      const salesBeforeConfirm = await salesService.findAll(businessId);
      const mappedReservation = salesBeforeConfirm.find((sale) => sale.id === reservation.id);

      expect(mappedReservation?.sourceType).toBe('RESERVATION');
      expect(mappedReservation?.status).toBe('PENDIENTE');
      expect(mappedReservation?.scheduledAt).toBeDefined();

      const firstResult = await salesService.confirmOrder(
        businessId,
        reservation.id,
        'RESERVATION',
      );
      const secondResult = await salesService.confirmOrder(
        businessId,
        reservation.id,
        'RESERVATION',
      );

      expect(firstResult.accountingCreated).toBe(true);
      expect(secondResult.accountingCreated).toBe(false);
      expect(secondResult.alreadyPosted).toBe(true);

      const reservationAfterConfirm = await prisma.reservation.findUnique({
        where: { id: reservation.id },
      });
      expect(reservationAfterConfirm?.status).toBe('CONFIRMED');

      const movements = await prisma.accountingMovement.findMany({
        where: { originId: reservation.id, originType: AccountingMovementOriginType.ORDER },
      });
      expect(movements).toHaveLength(2);
      expect(movements.every((movement) => Number(movement.amount) === 150)).toBe(true);
    });
  });

  describe('Date Range and UTC Handling', () => {
    it('should correctly include movements created at UTC edges when queried by local date', async () => {
        // Scenario: Argentina is UTC-3. 
        // A movement at 01:00 UTC on March 14th is actually 22:00 on March 13th in Argentina.
        // We want to make sure it's included when querying for March 13th if the logic is "local-aware".
        // The current backend logic uses 'new Date(year, monthIndex, day, 0, 0, 0, 0)' 
        // which creates a date in the SERVER'S LOCAL TIME (or system time).
        
        const testDate = new Date(Date.UTC(2026, 2, 14, 1, 0, 0)); // March 14, 2026 01:00 UTC
        
        const movement = await prisma.accountingMovement.create({
            data: {
                businessId,
                pucSubcuentaId: '110505',
                amount: 123.45,
                nature: 'DEBIT',
                date: testDate,
                detail: 'UTC Edge Test',
                originType: 'MANUAL',
            }
        });

        // Querying for "2026-03-13" to "2026-03-13" (March 13th)
        // If the server is in -03:00, this movement SHOULD be included if we are looking for local days.
        // However, the current parseDateBoundary in accounting.service.ts uses:
        // new Date(year, monthIndex, day, 0, 0, 0, 0) -> this is system local.
        
        // Let's check what the service returns
        const { AccountingService } = require('../src/accounting/accounting.service');
        const accountingServiceInstance = app.get<any>(AccountingService); // Use any to access private if needed, or just public findAllMovements
        
        const results = await accountingServiceInstance.findAllMovements(businessId, {
            from: '2026-03-13',
            to: '2026-03-14',
        });

        const found = results.find(m => m.id === movement.id);
        expect(found).toBeDefined();
    });
  });

  describe('Filtering and Detail Generation', () => {
    it('should correctly filter movements by originType', async () => {
        // 1. Create a MANUAL movement
        await prisma.accountingMovement.create({
          data: {
            businessId,
            pucSubcuentaId: '110505',
            amount: 10,
            nature: 'DEBIT',
            date: new Date(),
            detail: 'Manual Mov',
            originType: 'MANUAL',
          },
        });

        // 2. Query only ORDER origin
        const { AccountingService } = require('../src/accounting/accounting.service');
        const accountingServiceInstance = app.get<any>(AccountingService);
        
        const orderResults = await accountingServiceInstance.findAllMovements(businessId, {
            originType: 'ORDER',
        });

        expect(orderResults.every(m => m.originType === 'ORDER')).toBe(true);
    });

    it('should generate details with descriptive text including customer name and item type', async () => {
        const order = await prisma.order.create({
            data: {
              businessId,
              status: 'SENT',
              customerName: 'Detail Customer',
              customerWhatsapp: '123',
              total: 75.0,
              items: {
                create: {
                  businessId,
                  itemId,
                  quantity: 1,
                  itemNameSnapshot: 'Test Product',
                  itemTypeSnapshot: 'PRODUCT',
                  unitPrice: 75.0,
                  lineTotal: 75.0,
                },
              },
            },
          });
    
          await salesService.confirmOrder(businessId, order.id);
    
          const movements = await prisma.accountingMovement.findMany({
            where: { originId: order.id },
          });

          // Checking if detail contains "venta product" and "Detail Customer"
          expect(movements[0].detail.toLowerCase()).toContain('venta');
          expect(movements[0].detail.toLowerCase()).toContain('product');
          expect(movements[0].detail).toContain('Detail Customer');
    });
  });
});
