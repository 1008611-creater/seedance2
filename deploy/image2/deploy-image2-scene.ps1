$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $PSScriptRoot "production.env"
$composeFile = Join-Path $repoRoot "docker-compose.image2.yml"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing $envFile. Copy production.env.example and fill deployment values first."
}

docker compose --env-file $envFile -f $composeFile build
docker compose --env-file $envFile -f $composeFile up -d

docker ps --filter "name=image2-scene" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
