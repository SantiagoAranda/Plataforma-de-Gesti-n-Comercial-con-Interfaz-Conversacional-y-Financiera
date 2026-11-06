import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { BUSINESS_SLUG_PATTERN, RESERVED_BUSINESS_SLUGS } from '../src/common/utils/business-slug';

async function main() {
  // Never load dotenv or fall back to DATABASE_URL. This command only reads the DB.
  const raw = process.env.BUSINESS_SLUG_AUDIT_URL;
  if (!raw) throw new Error('Explicit BUSINESS_SLUG_AUDIT_URL required');
  const url = new URL(raw);
  console.log(JSON.stringify({ host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1), schema: url.searchParams.get('schema') || 'public' }));
  const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
  try {
    const rows = await prisma.business.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(row.slug.toLowerCase(), [...(groups.get(row.slug.toLowerCase()) || []), row]);
    console.log(JSON.stringify({
      businesses: rows.length,
      distinctSlugs: new Set(rows.map(r => r.slug)).size,
      empty: rows.filter(r => !r.slug.trim()),
      invalidFormat: rows.filter(r => !BUSINESS_SLUG_PATTERN.test(r.slug)),
      invalidLength: rows.filter(r => r.slug.length < 3 || r.slug.length > 50),
      reserved: rows.filter(r => RESERVED_BUSINESS_SLUGS.has(r.slug.toLowerCase())),
      caseCollisions: [...groups.values()].filter(g => g.length > 1),
    }, null, 2));
    const snapshotPath = process.argv[process.argv.indexOf('--snapshot') + 1];
    if (process.argv.includes('--verify')) {
      const reservations = await prisma.businessSlug.findMany();
      const owners = new Map(reservations.map(r => [r.slug, r.businessId]));
      const ids = new Set(rows.map(r => r.id));
      if (rows.some(r => owners.get(r.slug) !== r.id) || reservations.some(r => !ids.has(r.businessId))) {
        throw new Error('Missing/mismatched primary reservation or orphan');
      }
      if (process.argv.includes('--snapshot')) {
        const before = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as typeof rows;
        const current = new Map(rows.map(r => [r.id, r.slug]));
        if (before.some(r => current.get(r.id) !== r.slug)) throw new Error('An original business identifier changed');
      }
      console.log('Verified: every primary slug is reserved by its business; legacy identifiers preserved.');
    } else if (process.argv.includes('--snapshot')) {
      // Exclusive creation prevents accidentally replacing the pre-migration evidence.
      fs.writeFileSync(snapshotPath, JSON.stringify(rows, null, 2), { flag: 'wx' });
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Audit failed'); process.exitCode = 1; });
