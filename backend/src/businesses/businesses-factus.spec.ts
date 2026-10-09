import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { FiscalDocumentService } from '../fiscal-documents/fiscal-document.service';

const businessId = '94184ead-3224-4f69-85d3-3c0d0ddb15ec';
const technicalConfiguration = {
  businessId, enabled: false, environment: 'sandbox',
  encryptedCredentials: 'encrypted-test-credentials', credentialKeyVersion: 1,
  invoiceRangeId: 389, creditNoteRangeId: 1776,
  defaultPaymentForm: '1', defaultPaymentMethod: '10',
};

function setup(initial: Record<string, any> | null = null) {
  let row = initial ? { ...initial } : null;
  const prisma = {
    business: { findUnique: jest.fn(async () => ({ id: businessId, factusConfiguration: row })) },
    factusConfiguration: {
      upsert: jest.fn(async ({ create, update }) => {
        row = row ? { ...row, ...update } : {
          environment: 'sandbox', encryptedCredentials: null, credentialKeyVersion: 1,
          invoiceRangeId: null, creditNoteRangeId: null,
          defaultPaymentForm: null, defaultPaymentMethod: null, ...create,
        };
        return row;
      }),
      findUnique: jest.fn(async () => row),
    },
    fiscalDocument: { deleteMany: jest.fn(), updateMany: jest.fn() },
    fiscalDocumentArtifact: { deleteMany: jest.fn() },
  };
  const service = new BusinessesService(prisma as any, { getPublicUrl: jest.fn() } as any);
  const fiscal = new FiscalDocumentService(prisma as any, {} as any, {} as any);
  return { prisma, service, fiscal, row: () => row };
}

describe('ADMIN Factus entitlement', () => {
  it.each([true, false])('creates missing configuration with enabled=%s and model defaults', async (enabled) => {
    const { service, prisma, row } = setup();
    await expect(service.updateFactusEntitlement(businessId, { enabled })).resolves.toEqual({
      factus: { enabled, configured: false, environment: 'sandbox' },
    });
    expect(prisma.factusConfiguration.upsert).toHaveBeenCalledWith({
      where: { businessId }, create: { businessId, enabled }, update: { enabled },
      select: { enabled: true, environment: true, encryptedCredentials: true },
    });
    expect(row()).toMatchObject({ invoiceRangeId: null, creditNoteRangeId: null, encryptedCredentials: null });
  });

  it.each(['sandbox', 'production'])('toggles OFF/ON/OFF/ON preserving all technical fields in %s', async (environment) => {
    const original = { ...technicalConfiguration, environment };
    const { service, prisma, row, fiscal } = setup(original);
    for (const enabled of [true, false, true]) {
      const result = await service.updateFactusEntitlement(businessId, { enabled });
      expect(row()).toEqual({ ...original, enabled });
      expect(prisma.factusConfiguration.upsert.mock.calls.at(-1)?.[0].update).toEqual({ enabled });
      expect(result).toEqual({ factus: { enabled, configured: true, environment } });
      expect(await fiscal.getConfiguration(businessId)).toMatchObject({ enabled, environment, invoiceRangeId: 389, creditNoteRangeId: 1776 });
    }
    expect(prisma.fiscalDocument.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocumentArtifact.deleteMany).not.toHaveBeenCalled();
  });

  it('returns a safe ADMIN detail without the raw configuration', async () => {
    const { service } = setup(technicalConfiguration);
    const detail = await service.getBusinessById(businessId);
    expect(detail).toMatchObject({ factus: { enabled: false, configured: true, environment: 'sandbox' } });
    expect(detail).not.toHaveProperty('factusConfiguration');
    expect(JSON.stringify(detail)).not.toMatch(/encryptedCredentials|encrypted-test-credentials|clientSecret|password|token/i);
    expect((await setup().service.getBusinessById(businessId))?.factus).toEqual({ enabled: false, configured: false, environment: 'sandbox' });
  });

  it('rejects nonexistent businesses before writing', async () => {
    const { service, prisma } = setup();
    prisma.business.findUnique.mockResolvedValue(null as any);
    await expect(service.updateFactusEntitlement('missing', { enabled: true })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.factusConfiguration.upsert).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { enabled: 'true' }, { enabled: 1 }, { enabled: null }, { enabled: true, environment: 'production' }, { enabled: false, businessId: 'other' }])('rejects invalid payload %j', async (body) => {
    const { service, prisma } = setup();
    await expect(service.updateFactusEntitlement(businessId, body)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.factusConfiguration.upsert).not.toHaveBeenCalled();
  });

  it.each([null, false, true])('BUSINESS configuration preserves ADMIN entitlement %s', async (existingEnabled) => {
    const { fiscal, prisma, row } = setup(existingEnabled === null ? null : { ...technicalConfiguration, enabled: existingEnabled });
    for (const enabled of [true, false]) {
      await fiscal.configure(businessId, { enabled });
      expect(row()?.enabled).toBe(existingEnabled ?? false);
      const args = prisma.factusConfiguration.upsert.mock.calls.at(-1)?.[0];
      expect(args.create.enabled).toBe(false);
      expect(args.update).not.toHaveProperty('enabled');
    }
  });
});
