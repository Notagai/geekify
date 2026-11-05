# Build the standalone Inno Setup installer from the public Geekify checkout.
# Run in PowerShell on Windows with Node.js 20+, npm, VS Code and Inno Setup 6.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = [string]$pkg.version
$clientId = [string]$env:GEEKIFY_SPOTIFY_CLIENT_ID
if ($clientId -and $clientId -notmatch '^[a-fA-F0-9]{32}$') {
  throw 'GEEKIFY_SPOTIFY_CLIENT_ID must be a public Spotify Client ID (32 hex chars), or empty for a developer-only installer.'
}
$configPath = Join-Path $root 'vscode\spotify-client.json'
$original = [System.IO.File]::ReadAllBytes($configPath)
$release = Join-Path $root 'release'
New-Item -Path $release -ItemType Directory -Force | Out-Null
$vsixName = "geekify-$version.vsix"
try {
  $json = @{ clientId = $clientId } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, ([System.Text.UTF8Encoding]::new($false)))
  Push-Location $root
  try {
    & npm run extension:package
    if ($LASTEXITCODE -ne 0) { throw 'VSIX packaging failed.' }
  } finally { Pop-Location }
  $vsix = Join-Path $root $vsixName
  if (-not (Test-Path $vsix)) { throw "Missing generated VSIX: $vsix" }

  # A public installer must never contain private character assets or source.
  Add-Type -AssemblyName System.IO.Compression
  $zip = [System.IO.Compression.ZipFile]::OpenRead($vsix)
  try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName })
    foreach ($required in @('extension/package.json',
      'extension/vscode/extension.cjs', 'extension/vscode/panel.html',
      'extension/vscode/spotify-client.json')) {
      if ($entries -notcontains $required) { throw "VSIX missing $required" }
    }
    $private = @($entries | Where-Object {
      $_ -match '(?i)(reina|dynamic-char-integration|characters/|credentials\.dat|memory\.json)'
    })
    if ($private.Count) { throw "Private companion data in VSIX: $($private -join ', ')" }
    Write-Host "Public VSIX audit passed ($($entries.Count) entries)."
  } finally { $zip.Dispose() }
  Copy-Item $vsix (Join-Path $release $vsixName) -Force
} finally {
  [System.IO.File]::WriteAllBytes($configPath, $original)
}

$iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $iscc) {
  foreach ($candidate in @(
      "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
      "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )) {
    if (Test-Path $candidate) { $iscc = $candidate; break }
  }
}
if (-not $iscc) { throw 'Inno Setup 6 compiler ISCC.exe not found. Install Inno Setup 6 to build the EXE.' }

& $iscc (Join-Path $root 'installer\Geekify.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }
$installer = Join-Path $release "GeekifySetup-$version.exe"
if (-not (Test-Path $installer)) { throw "No installer created at $installer" }
Write-Host ""
Write-Host "Installer built: $installer"
if (-not $clientId) {
  Write-Warning 'No Spotify Client ID was embedded. Testers will be prompted for their own Client ID. A public one-click connection needs an approved Spotify application.'
}
