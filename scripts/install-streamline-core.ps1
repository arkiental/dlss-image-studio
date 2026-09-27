param(
  [Parameter(Mandatory=$true)][string]$SdkRoot,
  [Parameter(Mandatory=$true)][string]$ApplicationDirectory
)
$ErrorActionPreference='Stop'
$sdk=(Resolve-Path -LiteralPath $SdkRoot).Path
$application=(Resolve-Path -LiteralPath $ApplicationDirectory).Path
$production=Join-Path $sdk 'bin\x64'
$destination=Join-Path $application 'streamline'
foreach($name in @('sl.interposer.dll','sl.common.dll')) {
  $path=Join-Path $production $name
  $signature=Get-AuthenticodeSignature -LiteralPath $path
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'NVIDIA') {
    throw "Official NVIDIA production signature could not be verified: $name"
  }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($name in @('sl.interposer.dll','sl.common.dll')) {
  Copy-Item -LiteralPath (Join-Path $production $name) -Destination (Join-Path $destination $name)
}
Write-Output 'Copied signed Streamline core libraries. This does not install or enable DLSS Neural Rendering.'
