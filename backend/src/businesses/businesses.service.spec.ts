import { InternalServerErrorException } from '@nestjs/common';
import { PayrollAccountingSide } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { BusinessesService } from './businesses.service';

function payrollMappingTemplateRows() {
  const filePath = path.resolve(
    __dirname,
    '../../prisma/seed-data/payroll_accounting_mapping.csv',
  );
  return parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    record_delimiter: '\n',
  }) as Array<{
    concept_code: string;
    concept_name: string;
    account_code: string;
    account_name: string;
    side: PayrollAccountingSide;
  }>;
}

function createPrismaMock() {
  const tx = {
    business: {
      create: jest.fn().mockResolvedValue({
        id: 'biz-new',
        name: 'TecnoGames',
        fiscalId: '900123456',
        phoneWhatsapp: '3000000000',
        slug: 'tecnogames',
        status: 'ACTIVE',
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pucCuenta: {
      findUnique: jest.fn().mockResolvedValue({ code: '2505' }),
    },
    pucSubcuenta: {
      findFirst: jest.fn().mockResolvedValue({ code: '510506' }),
    },
    payrollAccountingMapping: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  return {
    tx,
    prisma: {
      business: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(tx)),
    },
  };
}

describe('BusinessesService payroll accounting defaults', () => {
  it('creates default payroll accounting mappings when a business is created', async () => {
    const { prisma, tx } = createPrismaMock();
    const service = new BusinessesService(
      prisma as any,
      {
        getPublicUrl: jest.fn(),
      } as any,
    );
    const rows = payrollMappingTemplateRows();

    await service.createBusiness({
      name: 'TecnoGames',
      fiscalId: '900123456',
      phoneWhatsapp: '3000000000',
    });

    expect(tx.business.create).toHaveBeenCalled();
    expect(tx.payrollAccountingMapping.upsert).toHaveBeenCalledTimes(
      rows.length,
    );
    expect(tx.payrollAccountingMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_conceptCode_side: {
            businessId: 'biz-new',
            conceptCode: 'SALARY',
            side: PayrollAccountingSide.DEBIT,
          },
        },
        create: expect.objectContaining({
          businessId: 'biz-new',
          conceptCode: 'SALARY',
          accountCode: '510506',
        }),
      }),
    );
  });

  it('allows creating a business before the fiscal document is loaded in RUT', async () => {
    const { prisma, tx } = createPrismaMock();
    const service = new BusinessesService(
      prisma as any,
      {
        getPublicUrl: jest.fn(),
      } as any,
    );

    await service.createBusiness({
      name: 'TecnoGames',
      phoneWhatsapp: '3000000000',
    });

    expect(tx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fiscalId: '',
        }),
      }),
    );
  });

  it('fails business creation when a payroll mapping account does not exist', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.pucSubcuenta.findFirst.mockResolvedValueOnce(null);
    const service = new BusinessesService(
      prisma as any,
      {
        getPublicUrl: jest.fn(),
      } as any,
    );

    await expect(
      service.createBusiness({
        name: 'TecnoGames',
        fiscalId: '900123456',
        phoneWhatsapp: '3000000000',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(tx.payrollAccountingMapping.upsert).not.toHaveBeenCalled();
  });
});
