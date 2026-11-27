param([Parameter(Mandatory = $true)][string]$PgBin, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $root '.local'
$cluster = Join-Path $runtime 'postgres'
$settings = Join-Path $runtime 'connection.env'
$secretFile = Join-Path $runtime 'cluster.setup'
$bin = (Resolve-Path -LiteralPath $PgBin).Path
$control = Join-Path $bin 'pg_ctl.exe'
$initializer = Join-Path $bin 'initdb.exe'
if (!(Test-Path -LiteralPath $control) -or !(Test-Path -LiteralPath $initializer)) { throw 'Provide PostgreSQL bin.' }
if ($Stop) {
  if (!(Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) { throw 'No OrderFlow cluster exists.' }
  & $control -D $cluster -m fast -w stop
  exit $LASTEXITCODE
}
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) {
  if ((Test-Path -LiteralPath $cluster) -or (Test-Path -LiteralPath $settings)) { throw 'Inspect the existing data/settings.' }
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [IO.File]::WriteAllText($secretFile, [Convert]::ToBase64String($bytes), [Text.UTF8Encoding]::new($false))
  & $initializer -D $cluster -U orderflow_cluster --auth=scram-sha-256 --pwfile=$secretFile --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
}
& $control -D $cluster status
if ($LASTEXITCODE -ne 0) {
  & node (Join-Path $root '..\..\scripts\check-ports.mjs') 5763
  if ($LASTEXITCODE -ne 0) { throw 'Port 5763 is occupied.' }
  & $control -D $cluster -o '-h 127.0.0.1 -p 5763' -l (Join-Path $runtime 'postgres.log') -w start
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not start.' }
}
Push-Location -LiteralPath $root
try {
  if (!(Test-Path -LiteralPath $settings)) {
    & node tools/setup-db.ts
    if ($LASTEXITCODE -ne 0) { throw 'Database setup failed.' }
  }
  if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile }
  & npm.cmd run migrate
  if ($LASTEXITCODE -ne 0) { throw 'IT migration failed.' }
  & node --env-file=.local/test.env server/migrate.ts
  if ($LASTEXITCODE -ne 0) { throw 'Test migration failed.' }
} finally { Pop-Location }
