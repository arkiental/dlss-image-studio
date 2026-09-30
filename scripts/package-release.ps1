param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release'))
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$config = Get-Content -LiteralPath (Join-Path $repo 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = $config.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable semantic version' }
if ($env:GITHUB_REF -like 'refs/tags/*' -and $env:GITHUB_REF -ne "refs/tags/v$version") { throw 'Tag/version mismatch' }
$binary = Join-Path $repo 'src-tauri\target\release\dlss-image-studio.exe'
$setup = Join-Path $repo "src-tauri\target\release\bundle\nsis\DLSS Image Studio_${version}_x64-setup.exe"
foreach ($file in @($binary, $setup)) { if (!(Test-Path -LiteralPath $file)) { throw "Missing build: $file" } }
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$name = "DLSS-Image-Studio-$version-Windows-x64"
$stage = Join-Path $output ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'dlss-image-studio.exe')
foreach ($file in @('LICENSE','THIRD_PARTY_NOTICES.txt','README.md','CHANGELOG.md','DLSS_INTEGRATION.md','CONTRIBUTING.md','SECURITY.md','BUILDING.md')) {
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $stage
}
Copy-Item -LiteralPath (Join-Path $repo 'docs') -Destination (Join-Path $stage 'docs') -Recurse
@'
DLSS Image Studio
Run dlss-image-studio.exe. WebView2 must already be installed; use Setup if missing.
Read docs/INSTALLATION.md and docs/USER_GUIDE.md.
50 LUTs and conventional finishing are included. Neural rendering requires the
separately licensed Visual Enhancer v13.2 package; it is NOT bundled.
Disable Neural Adjustments if you have not configured that runtime.
Original images are not overwritten by editing. Keep your own project/source backups.
'@ | Set-Content -LiteralPath (Join-Path $stage 'START-HERE.txt') -Encoding UTF8
$zip = Join-Path $output "$name-Portable.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
$installer = Join-Path $output "$name-Setup.exe"
Copy-Item -LiteralPath $setup -Destination $installer -Force
@($installer, $zip) | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))"
} | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
# Retain staging for inspection; no recursive deletion or wildcard binary bundling.
Write-Output "Release assets: $output"
