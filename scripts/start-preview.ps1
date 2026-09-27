$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $bundledNode) {
    $nodeExecutable = $bundledNode
} else {
    throw '没有找到 Node.js；可直接用浏览器打开项目 index.html。'
}
Push-Location -LiteralPath $projectRoot
try {
    & $nodeExecutable (Join-Path $PSScriptRoot 'serve.cjs')
} finally {
    Pop-Location
}
