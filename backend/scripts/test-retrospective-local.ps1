param([string]$TestPattern = 'registro retrospectivo', [switch]$All, [switch]$BaselinePayroll, [int]$Port = 55448)
$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$runId = 'retrospective-' + [guid]::NewGuid().ToString('N')
$container = 'sactec-' + $runId
$database = 'sactec_retrospective_test'
$password = [guid]::NewGuid().ToString('N')
$evidence = Join-Path $env:TEMP $runId
$runner = Join-Path $evidence 'backend'
$createdId = $null
$unitExit = 0
$integrationExit = 0
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed: $LASTEXITCODE" } }
$keys = @('DATABASE_URL','SACTEC_TEST_RUN_ID','JWT_SECRET','NODE_ENV','RUN_AUTH_DB_TESTS','AUTH_TEST_DATABASE_URL','RUN_BUSINESS_SLUG_DB_TESTS','RUN_BUSINESS_NAME_DB_TESTS','BUSINESS_SLUG_TEST_DATABASE_URL','BUSINESS_NAME_TEST_DATABASE_URL')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
  if ($env:DOCKER_HOST -or $env:DOCKER_CONTEXT) { throw 'Docker overrides are not allowed' }
  $endpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
  Check-Exit
  if (-not $endpoint.StartsWith('npipe:')) { throw 'A local Docker engine is required' }
  New-Item -ItemType Directory -Path $runner -Force | Out-Null
  robocopy $backend $runner /E /XD node_modules dist .git /XF .env .env.* *.log | Out-Null
  if ($LASTEXITCODE -gt 7) { throw 'Copy failed' }
  robocopy (Join-Path (Split-Path $backend -Parent) 'frontend') (Join-Path $evidence 'frontend') /E /XD node_modules .next .git /XF .env .env.* *.log | Out-Null
  if ($LASTEXITCODE -gt 7) { throw 'Frontend fixture copy failed' }
  if ($BaselinePayroll) {
    git -C (Split-Path $backend -Parent) archive HEAD backend/src backend/test --output (Join-Path $evidence 'baseline.tar')
    Check-Exit
    tar -xf (Join-Path $evidence 'baseline.tar') -C $evidence
    Check-Exit
  }
  New-Item -ItemType Junction -Path (Join-Path $runner 'node_modules') -Target (Join-Path $backend 'node_modules') | Out-Null
  $createdId = docker run --detach --name $container --label "sactec.test=$runId" --publish "127.0.0.1:${port}:5432" --env "POSTGRES_PASSWORD=$password" --env "POSTGRES_DB=$database" postgres:16
  Check-Exit
  $info = docker inspect $container | ConvertFrom-Json
  if ($info.Id -ne $createdId -or $info.Config.Labels.'sactec.test' -ne $runId) { throw 'Container mismatch' }
  $binding = $info.HostConfig.PortBindings.'5432/tcp'[0]
  if ($binding.HostIp -ne '127.0.0.1' -or $binding.HostPort -ne "$port") { throw 'Binding mismatch' }
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $createdId pg_isready -h 127.0.0.1 -U postgres -d $database | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  Check-Exit
  $env:DATABASE_URL = "postgresql://postgres:${password}@127.0.0.1:${port}/${database}?schema=public"
  $env:SACTEC_TEST_RUN_ID = $runId
  $env:RUN_AUTH_DB_TESTS = '1'
  $env:AUTH_TEST_DATABASE_URL = $env:DATABASE_URL.Replace('schema=public', 'schema=auth_stage1_test')
  $env:JWT_SECRET = 'isolated-retrospective-test-only-secret'
  $env:NODE_ENV = 'test'
  $env:BUSINESS_SLUG_TEST_DATABASE_URL = $env:DATABASE_URL
  $env:BUSINESS_NAME_TEST_DATABASE_URL = $env:DATABASE_URL
  $env:RUN_BUSINESS_SLUG_DB_TESTS = '0' # This suite requires its dedicated legacy-backfill runner.
  $env:RUN_BUSINESS_NAME_DB_TESTS = '1'
  Push-Location $runner
  try {
    $ErrorActionPreference = 'Continue'
    & ./node_modules/.bin/prisma.cmd migrate deploy *> (Join-Path $evidence 'migrations.log')
    Check-Exit
    ('CREATE TABLE "SactecTestEnvironment" ("runId" TEXT PRIMARY KEY); INSERT INTO "SactecTestEnvironment" VALUES (''{0}'');' -f $runId) | docker exec -i $createdId psql -v ON_ERROR_STOP=1 -U postgres -d $database
    Check-Exit
    if ($All) {
      $publicUrl = $env:DATABASE_URL
      $env:DATABASE_URL = $env:AUTH_TEST_DATABASE_URL
      & ./node_modules/.bin/prisma.cmd db push --skip-generate *> (Join-Path $evidence 'auth-schema.log')
      Check-Exit
      $env:DATABASE_URL = $publicUrl
    }
    if ($BaselinePayroll) {
      & ./node_modules/.bin/jest.cmd --config test/jest-e2e.json --runInBand --forceExit --runTestsByPath test/payroll-payments.e2e-spec.ts test/payroll-advanced-audits.e2e-spec.ts *> (Join-Path $evidence 'baseline-payroll.log')
      $integrationExit = $LASTEXITCODE
      Write-Output "baseline payroll=$integrationExit"
    } elseif ($All) {
      & ./node_modules/.bin/jest.cmd --runInBand *> (Join-Path $evidence 'backend-unit.log')
      $unitExit = $LASTEXITCODE
      & ./node_modules/.bin/jest.cmd --config test/jest-e2e.json --runInBand --forceExit *> (Join-Path $evidence 'postgres-integration.log')
      $integrationExit = $LASTEXITCODE
      Write-Output "unit=$unitExit integration=$integrationExit"
    } else {
      & ./node_modules/.bin/jest.cmd --config test/jest-e2e.json --runInBand --forceExit reservations-concurrency --testNamePattern $TestPattern *> (Join-Path $evidence 'postgres-integration.log')
      $integrationExit = $LASTEXITCODE
      Write-Output "integration=$integrationExit"
    }
  } finally { Pop-Location }
} finally {
  if ($createdId) { docker stop $createdId | Out-Null }
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
  Write-Output "Evidence: $evidence; isolated container retained stopped: $container"
}

if ($unitExit -ne 0 -or $integrationExit -ne 0) { exit 1 }
