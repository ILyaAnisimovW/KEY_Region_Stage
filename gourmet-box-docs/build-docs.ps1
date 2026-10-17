param([switch]$Serve)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $taskMkdocs = Join-Path $PSScriptRoot '.venv/Scripts/mkdocs.exe'
    if (-not (Test-Path -LiteralPath $taskMkdocs)) {
        throw 'Создайте .venv и установите requirements-docs.lock.txt по инструкции docs/05-documentation.md'
    }
    & npx --yes '@redocly/cli@2.64.1' lint openapi.yaml
    if ($LASTEXITCODE -ne 0) { throw 'OpenAPI lint failed' }
    & npx --yes '@redocly/cli@2.64.1' build-docs openapi.yaml --output docs/api.html
    if ($LASTEXITCODE -ne 0) { throw 'Redoc build failed' }
    Copy-Item -LiteralPath openapi.yaml -Destination docs/openapi.yaml
    & $taskMkdocs build --strict
    if ($LASTEXITCODE -ne 0) { throw 'MkDocs build failed' }
    if ($Serve) { & $taskMkdocs serve }
} finally {
    Pop-Location
}
