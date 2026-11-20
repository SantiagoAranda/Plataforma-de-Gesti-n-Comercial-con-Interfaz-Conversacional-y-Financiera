/* Disposable local PG16: existing migrations, public catalog and sales/reservations regression. */
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dockerExe = process.platform === 'win32' ? 'docker.exe' : 'docker';
const prismaCli = path.join(root, 'node_modules/prisma/build/index.js');
const name = 'public-catalog-f12-pg-test';
const port = '55437';
const user = 'reservas_b1';
const mainDb = 'public_catalog_f12_test';
const run = crypto.randomUUID();
const specs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['test/public-catalog-visibility.e2e-spec.ts', 'test/reservations-concurrency.e2e-spec.ts', 'test/sales-flow.e2e-spec.ts'];
const password = crypto.randomBytes(24).toString('hex');
let failed = false;
const redact = (value) => String(value).replaceAll(password, '[REDACTADO]');

function command(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    const output = redact(String(result.stdout || '') + String(result.stderr || ''));
    throw new Error(output || result.error?.message || 'Command failed');
  }
  return String(result.stdout || '').trim();
}
const docker = (args, options) => command(dockerExe, args, options);
const urlFor = (db) => `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;
let containerId = null;
const psql = (db, sql) =>
  docker(['exec', '-i', containerId, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql }).replaceAll('\r', '');
const prisma = (args, db) =>
  command(process.execPath, [prismaCli, ...args], { env: { ...process.env, DATABASE_URL: urlFor(db) } });

try {
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('No se permiten overrides de Docker.');
  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (process.platform === 'win32' ? !endpoint.startsWith('npipe:') : !endpoint.startsWith('unix:')) throw new Error('El motor Docker no es local.');
  if (docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])) throw new Error('El contenedor de prueba ya existe.');

  containerId = docker(['run', '--detach', '--rm', '--name', name, '--label', 'purpose=reservations-b1-disposable-test', '--label', `verification-run=${run}`, '--publish', `127.0.0.1:${port}:5432`, '--tmpfs', '/var/lib/postgresql/data', '--env', `POSTGRES_USER=${user}`, '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${mainDb}`, 'postgres:16']);
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('ID inesperado.');
  const hostConfig = JSON.parse(docker(['inspect', containerId, '--format', '{{json .HostConfig}}']));
  const ports = hostConfig.PortBindings?.['5432/tcp'];
  if (!ports || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== port || !Object.hasOwn(hostConfig.Tmpfs ?? {}, '/var/lib/postgresql/data')) throw new Error('Aislamiento no verificado.');

  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (spawnSync(dockerExe, ['exec', containerId, 'pg_isready', '-U', user, '-d', mainDb], { stdio: 'ignore' }).status === 0) {
      // pg_isready may succeed during the init restart; confirm a real query works.
      try { psql(mainDb, 'SELECT 1;'); ready = true; break; } catch { /* retry */ }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw new Error('PostgreSQL no quedó listo.');
  if (psql(mainDb, "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');") !== '0') throw new Error('Base no vacía.');
  console.log('Aislamiento verificado: contenedor nuevo, loopback, tmpfs y base vacía.');
  // Non-UTC database so time-zone dependence surfaces, as in the auth runner.
  psql(mainDb, `ALTER DATABASE ${mainDb} SET timezone TO 'America/Bogota';`);

  // 1) Real migration history on the main database (no db push fallback).
  const deploy = prisma(['migrate', 'deploy'], mainDb);
  console.log('migrate deploy:', deploy.split('\n').filter((l) => /applied|migrations? found|No pending/i.test(l)).join(' | '));
  const indexes = psql(mainDb, `SELECT indexname || ' :: ' || indexdef FROM pg_indexes WHERE tablename = 'Reservation' ORDER BY indexname;`);
  console.log('Índices de Reservation:\n' + indexes);
  if (!/Reservation_active_slot_key :: CREATE UNIQUE INDEX .*WHERE .*status.*<>.*CANCELLED/.test(indexes)) throw new Error('Falta el índice parcial.');
  if (indexes.includes('Reservation_itemId_date_startMinute_key')) throw new Error('El índice anterior sigue presente.');

  // 2) Drift between migrated database and schema.prisma (informative).
  const drift = prisma(['migrate', 'diff', '--from-url', urlFor(mainDb), '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], mainDb);
  console.log('migrate diff (DB -> schema.prisma):\n' + (drift || '(sin diferencias)'));

  // 4) E2E suites against the migrated main database.
  psql(mainDb, `CREATE TABLE public."SactecTestEnvironment"("runId" text PRIMARY KEY); INSERT INTO public."SactecTestEnvironment" VALUES ('${run}');`);
  const env = { ...process.env, DATABASE_URL: urlFor(mainDb), SACTEC_TEST_RUN_ID: run, JWT_SECRET: 'fixture-secret' };
  const resultPath = path.join(os.tmpdir(), `public-catalog-f12-${run}.json`);
  const jest = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-e2e.json', '--runInBand', '--no-cache', '--json', `--outputFile=${resultPath}`, '--runTestsByPath', ...specs], { cwd: root, encoding: 'utf8', env });
  if (!fs.existsSync(resultPath)) throw new Error('Jest no produjo resultados: ' + redact(jest.stderr));
  const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  console.log('JEST', JSON.stringify({ total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests }));
  for (const suite of report.testResults) {
    console.log(`# ${path.basename(suite.name)}`);
    for (const result of suite.assertionResults) {
      console.log(result.status, '-', result.title);
      if (result.status === 'failed') console.log(redact(result.failureMessages.join('\n')).split('\n').slice(0, 12).join('\n'));
    }
    if (suite.message && suite.assertionResults.length === 0) console.log(redact(suite.message).split('\n').slice(0, 30).join('\n'));
  }
  if (jest.status !== 0 || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTotalTests === 0) throw new Error('Fallo de integración.');
} catch (error) {
  failed = true;
  console.log('ERROR:', redact(error.message));
} finally {
  
  try {
    const owned = docker(['ps', '-a', '--filter', `name=^/${name}$`, '--filter', `label=verification-run=${run}`, '--format', '{{.ID}}']);
    if (owned) {
      docker(['stop', owned]);
      console.log('Contenedor de prueba detenido y eliminado.');
    } else console.log('No quedó contenedor de esta ejecución.');
  } catch (error) { failed = true; console.log('ERROR DE LIMPIEZA:', error.message); }
}
if (failed) process.exitCode = 1;
