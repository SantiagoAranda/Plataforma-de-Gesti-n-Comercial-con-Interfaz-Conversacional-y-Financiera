import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FiscalDocumentService } from '../src/fiscal-documents/fiscal-document.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { readFile } from 'fs/promises';

type Args = { documentId?: string; responseFile?: string; type?: string };

function args(): Args {
  const values: Args = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (key === '--document-id') values.documentId = value;
    if (key === '--response-file') values.responseFile = value;
    if (key === '--type') values.type = value;
  }
  return values;
}

async function main() {
  const input = args();
  if (!input.documentId || !input.responseFile || !['INVOICE', 'CREDIT_NOTE'].includes(input.type ?? '')) {
    throw new Error(
      'Uso: ts-node -r tsconfig-paths/register scripts/reconcile-factus-accepted-document.ts --document-id <uuid> --type <INVOICE|CREDIT_NOTE> --response-file <factus-response.json>',
    );
  }
  const response = JSON.parse(await readFile(input.responseFile, 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const document = await prisma.fiscalDocument.findUnique({
      where: { id: input.documentId },
      select: { id: true, businessId: true, type: true, referenceCode: true },
    });
    if (!document) throw new Error('Documento fiscal no encontrado');
    if (document.type !== input.type) throw new Error('El tipo indicado no coincide con el documento fiscal');
    const service = app.get(FiscalDocumentService);
    const reconciled = await service.reconcileAcceptedProviderResponse(
      document.businessId,
      document.id,
      response,
    );
    console.log(JSON.stringify({
      id: reconciled?.id,
      referenceCode: document.referenceCode,
      status: reconciled?.status,
      factusNumber: reconciled?.factusNumber,
      dianValidatedAt: reconciled?.dianValidatedAt,
    }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(`Reconciliacion Factus fallida: ${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
