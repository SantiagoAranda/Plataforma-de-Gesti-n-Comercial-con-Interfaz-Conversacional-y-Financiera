/* Creates only a new disposable Docker database; never uses the configured DATABASE_URL. */
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');

const root = path.resolve(__dirname, '..');
const dockerExe = process.platform === 'win32' ? 'docker.exe' : 'docker';
const name = 'auth-stage2-pg-test';
const run = crypto.randomUUID();
const password = crypto.randomBytes(24).toString('hex');
let failed = false;
const redact = (value) => String(value).replaceAll(password, '[REDACTADO]').replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[HASH]');

function command(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    const output = redact(String(result.stdout || '') + String(result.stderr || ''));
    throw new Error(output || result.error?.message || 'Command failed');
  }
  return String(result.stdout || '').trim();
}
function docker(args, options) { return command(dockerExe, args, options); }

try {
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('No se permiten overrides de Docker.');
  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (process.platform === 'win32' ? !endpoint.startsWith('npipe:') : !endpoint.startsWith('unix:')) throw new Error('El motor Docker no es local.');
  if (docker(['info', '--format', '{{.OSType}}']) !== 'linux') throw new Error('Se requiere Docker Linux.');
  if (docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])) throw new Error('El contenedor de prueba ya existe.');
  const id = docker(['run', '--detach', '--rm', '--name', name, '--label', 'purpose=auth-stage2-disposable-test', '--label', `verification-run=${run}`, '--publish', '127.0.0.1:55432:5432', '--tmpfs', '/var/lib/postgresql/data', '--env', 'POSTGRES_USER=auth_stage2', '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=auth_stage2_test', 'postgres:16']);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('ID inesperado.');
  const host = JSON.parse(docker(['inspect', id, '--format', '{{json .HostConfig}}']));
  const labels = JSON.parse(docker(['inspect', id, '--format', '{{json .Config.Labels}}']));
  const ports = host.PortBindings?.['5432/tcp'];
  if (docker(['inspect', id, '--format', '{{.Name}}|{{.Config.Image}}']) !== `/${name}|postgres:16` || labels.purpose !== 'auth-stage2-disposable-test' || labels['verification-run'] !== run || !ports || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '55432' || !Object.hasOwn(host.Tmpfs ?? {}, '/var/lib/postgresql/data')) throw new Error('Aislamiento no verificado.');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const result = spawnSync(dockerExe, ['exec', id, 'pg_isready', '-U', 'auth_stage2', '-d', 'auth_stage2_test'], { stdio: 'ignore' });
    if (result.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw new Error('PostgreSQL no quedó listo.');
  const identity = docker(['exec', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-v', 'ON_ERROR_STOP=1', '-Atc', "SELECT current_database() || '|' || current_user; SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"]);
  if (identity.replaceAll('\r', '') !== 'auth_stage2_test|auth_stage2\n0') throw new Error('Base vacía no verificada.');
  console.log('Aislamiento verificado: contenedor nuevo, loopback, tmpfs, usuario y base vacía.');
  const raw = `postgresql://auth_stage2:${password}@127.0.0.1:55432/auth_stage2_test?schema=auth_stage1_test`;
  const url = new URL(raw);
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/auth_stage2_test' || url.searchParams.get('schema') !== 'auth_stage1_test') throw new Error('URL no permitida.');
  const env = { ...process.env, DATABASE_URL: raw, AUTH_TEST_DATABASE_URL: raw, RUN_AUTH_DB_TESTS: '1', JWT_SECRET: 'fixture-secret' };
  // The whole suite runs against a non-UTC database so any time-zone dependence surfaces.
  docker(['exec', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-v', 'ON_ERROR_STOP=1', '-c', "ALTER DATABASE auth_stage2_test SET timezone TO 'America/Bogota'"]);
  env.AUTH_TEST_NON_UTC_DB = '1';
  command(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env });
  const fixtureHash = bcrypt.hashSync('  clave histórica ficticia  ', 10);
  const before = 'SET search_path TO auth_stage1_test;\nDROP TABLE "PasswordResetToken";\nALTER TABLE "User" DROP COLUMN "sessionVersion";\nALTER TABLE "PushSubscription" DROP COLUMN "authorizedSessionVersion";\nINSERT INTO "User" ("id","email","password","role","createdAt","updatedAt") VALUES (\'migration-fixture\',\'migration-fixture@example.test\',\'' + fixtureHash + '\',\'ADMIN\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n';
  command(dockerExe, ['exec', '-i', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-v', 'ON_ERROR_STOP=1'], { input: before });
  const sql = 'SET search_path TO auth_stage1_test;\n' + fs.readFileSync(path.join(root, 'prisma/migrations/20261103000000_password_reset/migration.sql'), 'utf8');
  command(dockerExe, ['exec', '-i', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-v', 'ON_ERROR_STOP=1'], { input: sql });
  const pushSql = 'SET search_path TO auth_stage1_test;\n' + fs.readFileSync(path.join(root, 'prisma/migrations/20261104000000_push_device_authorization/migration.sql'), 'utf8');
  command(dockerExe, ['exec', '-i', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-v', 'ON_ERROR_STOP=1'], { input: pushSql });
  const column = docker(['exec', id, 'psql', '-U', 'auth_stage2', '-d', 'auth_stage2_test', '-Atc', "SELECT column_default || '|' || is_nullable FROM information_schema.columns WHERE table_schema = 'auth_stage1_test' AND table_name = 'PushSubscription' AND column_name = 'authorizedSessionVersion'"]);
  if (column.replaceAll('\r', '') !== '0|NO') throw new Error('Migración de push inesperada: ' + column);
  const verify ="const {PrismaClient}=require('@prisma/client');const b=require('bcrypt');(async()=>{const p=new PrismaClient();try{const u=await p.user.findUniqueOrThrow({where:{id:'migration-fixture'}});if(u.sessionVersion!==0 || !(await b.compare('  clave histórica ficticia  ',u.password)))process.exitCode=1;else console.log('Migración conserva bcrypt ficticio y versión 0');}finally{await p.$disconnect()}})().catch(()=>{process.exitCode=1});";
  console.log(command(process.execPath, ['-e', verify], { env }));
  const resultPath = path.join(os.tmpdir(), `auth-stage2-final-${run}.json`);
  const jest = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-e2e.json', '--runInBand', '--no-cache', '--json', `--outputFile=${resultPath}`, '--runTestsByPath', 'test/auth-concurrency.e2e-spec.ts', 'test/password-recovery.e2e-spec.ts'], { cwd: root, encoding: 'utf8', env });
  if (!fs.existsSync(resultPath)) throw new Error('Jest no produjo resultados: ' + redact(jest.stderr));
  const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  console.log('JEST', JSON.stringify({ total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests }));
  for (const suite of report.testResults) for (const result of suite.assertionResults) console.log(result.status, result.title);
  if (jest.status !== 0 || report.numTotalTests !== 18 || report.numPassedTests !== 18 || report.numPendingTests !== 0) {
    console.log(redact(jest.stderr));
    throw new Error('Fallo de integración.');
  }
} catch (error) {
  failed = true;
  console.log('ERROR:', redact(error.message));
} finally {
  try {
    const owned = docker(['ps', '-a', '--filter', `name=^/${name}$`, '--filter', `label=verification-run=${run}`, '--format', '{{.ID}}']);
    if (owned) {
      docker(['stop', owned]);
      let remaining = owned;
      for (let i = 0; i < 20 && remaining; i++) {
        remaining = docker(['ps', '-a', '--filter', `name=^/${name}$`, '--filter', `label=verification-run=${run}`, '--format', '{{.ID}}']);
        if (remaining) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      if (remaining) throw new Error('Eliminación no confirmada.');
      console.log('Contenedor de prueba detenido y eliminado.');
    } else console.log('No quedó contenedor de esta ejecución.');
  } catch (error) { failed = true; console.log('ERROR DE LIMPIEZA:', error.message); }
}
if (failed) process.exitCode = 1;
