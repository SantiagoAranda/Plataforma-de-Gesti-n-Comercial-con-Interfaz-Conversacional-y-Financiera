$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$runId = 'slug-stage2-' + [guid]::NewGuid().ToString('N')
$container = 'sactec-' + $runId
$password = [guid]::NewGuid().ToString('N')
$database = 'sactec_slug_stage2_test'
$port = 55441
$evidence = Join-Path $env:TEMP $runId
$keys = @('DATABASE_URL','BUSINESS_SLUG_AUDIT_URL','BUSINESS_SLUG_TEST_DATABASE_URL','BUSINESS_NAME_TEST_DATABASE_URL','SACTEC_TEST_RUN_ID','RUN_BUSINESS_SLUG_DB_TESTS','RUN_BUSINESS_NAME_DB_TESTS')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
$createdId = $null
Push-Location $backend
try {
  New-Item -ItemType Directory -Path $evidence | Out-Null
  $createdId = docker run --detach --name $container --label "sactec.test=$runId" --publish "127.0.0.1:${port}:5432" --env "POSTGRES_PASSWORD=$password" --env "POSTGRES_DB=$database" postgres:16
  Check-Exit
  $info = docker inspect $container | ConvertFrom-Json
  Check-Exit
  if ($info.Id -ne $createdId -or $info.Config.Labels.'sactec.test' -ne $runId) { throw 'Container identity mismatch' }
  $binding = $info.HostConfig.PortBindings.'5432/tcp'[0]
  if ($binding.HostIp -ne '127.0.0.1' -or $binding.HostPort -ne "$port") { throw 'Unexpected port binding' }
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    # The image starts a temporary Unix-socket-only server during initialization.
    # Wait for the final TCP listener, not that temporary server.
    docker exec $container pg_isready -h 127.0.0.1 -U postgres -d $database | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL did not start' }
  $count = docker exec $container psql -U postgres -d $database -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
  Check-Exit
  if ($count.Trim() -ne '0') { throw 'New database is not empty' }
  $env:DATABASE_URL = "postgresql://postgres:${password}@127.0.0.1:${port}/${database}?schema=public"
  $target = [uri]$env:DATABASE_URL
  if ($target.Host -ne '127.0.0.1' -or $target.Port -ne $port -or $target.AbsolutePath -ne "/$database" -or $target.Query -ne '?schema=public') { throw 'Connection target mismatch' }
  Write-Output "Verified NEW isolated database: 127.0.0.1:${port}/${database}, schema public; container $createdId"
  $schema = Get-Content prisma/schema.prisma -Raw
  $before = $schema -replace '(?m)^\s*slugs\s+BusinessSlug\[\]\s*\r?\n', '' -replace '(?s)model BusinessSlug \{.*?\}\s*', ''
  $beforePath = Join-Path $evidence 'before.prisma'
  [IO.File]::WriteAllText($beforePath, $before, (New-Object Text.UTF8Encoding($false)))
  & ./node_modules/.bin/prisma.cmd db push --schema $beforePath --skip-generate
  Check-Exit
  $fixtures = @'
CREATE TABLE "SactecTestEnvironment" ("runId" TEXT PRIMARY KEY);
INSERT INTO "SactecTestEnvironment" VALUES ('RUN_ID');
INSERT INTO "Business" ("id","name","slug","fiscalId","phoneWhatsapp","updatedAt") VALUES
('legacy-1','Legacy One','tecnogames-1','tax-1','000',NOW()),
('legacy-2','Legacy Two','ADMIN','tax-2','000',NOW()),
('legacy-3','Legacy Three','MiTienda','tax-3','000',NOW()),
('legacy-4','Legacy Four','mitienda','tax-4','000',NOW()),
('legacy-5','Legacy Five','','tax-5','000',NOW()),
('legacy-6','Legacy Six','bad slug','tax-6','000',NOW());
'@
  $fixtures.Replace('RUN_ID', $runId) | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d $database
  Check-Exit
  $env:BUSINESS_SLUG_AUDIT_URL = $env:DATABASE_URL
  & ./node_modules/.bin/ts-node.cmd scripts/audit-business-slugs.ts --snapshot (Join-Path $evidence 'before.json')
  Check-Exit
  # Execute the real migration, not db push, against the populated old schema.
  & ./node_modules/.bin/prisma.cmd db execute --file prisma/migrations/20261106120000_business_slug_registry/migration.sql --schema prisma/schema.prisma
  Check-Exit
  & ./node_modules/.bin/ts-node.cmd scripts/audit-business-slugs.ts --verify --snapshot (Join-Path $evidence 'before.json')
  Check-Exit
  $env:SACTEC_TEST_RUN_ID = $runId
  $env:BUSINESS_SLUG_TEST_DATABASE_URL = $env:DATABASE_URL
  $env:BUSINESS_NAME_TEST_DATABASE_URL = $env:DATABASE_URL
  $env:RUN_BUSINESS_SLUG_DB_TESTS = '1'
  $env:RUN_BUSINESS_NAME_DB_TESTS = '1'
  & ./node_modules/.bin/jest.cmd --config test/jest-e2e.json --runInBand business-slugs business-name
  Check-Exit
} finally {
  # Stop only the container created by this invocation. Retain its data for inspection.
  if ($createdId) { docker stop $createdId | Out-Null }
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
  Pop-Location
  Write-Output "Evidence: $evidence; test container retained stopped: $container"
}
