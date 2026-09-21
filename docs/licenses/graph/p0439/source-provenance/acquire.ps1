# Reproduce acquisition only. This script does not install LibreOffice globally.
[CmdletBinding()]
param([switch]$Extract)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$engineRoot = $PSScriptRoot
$downloadRoot = Join-Path $engineRoot 'downloads'
$evidenceRoot = Join-Path $engineRoot 'evidence'
New-Item -ItemType Directory -Force -Path $downloadRoot,$evidenceRoot | Out-Null
$release = '26.8.0'
$version = '26.8.0.3'
$specs = @(
    @{Name='LibreOffice_26.8.0_Win_x86-64.msi'; Url='https://download.documentfoundation.org/libreoffice/stable/26.8.0/win/x86_64/LibreOffice_26.8.0_Win_x86-64.msi'; Hash='4aa6c6e1895f4055104effcb556bd3362d20c6ad707c149543304f395ef9db95'},
    @{Name='libreoffice-26.8.0.3.tar.xz'; Url='https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-26.8.0.3.tar.xz'; Hash='42116e256933aa575974e420ffa04f7cd7096f4b7ca5d0907ddeaf2a07f68f94'},
    @{Name='libreoffice-dictionaries-26.8.0.3.tar.xz'; Url='https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-dictionaries-26.8.0.3.tar.xz'; Hash='4849ca14733cf4d5896a2f5bb6db87ffade9d1fbeab92e63153dc79630995a60'},
    @{Name='libreoffice-help-26.8.0.3.tar.xz'; Url='https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-help-26.8.0.3.tar.xz'; Hash='8443f21b7127cbd084b472c01ff494ec6a31814f0b1b382004b68103ece90e35'},
    @{Name='libreoffice-translations-26.8.0.3.tar.xz'; Url='https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-translations-26.8.0.3.tar.xz'; Hash='dc1419fc6f02840735b01f28b1cd453885e50fad2b2b2f5e6beab93868bf82a4'}
)
$receipts = @()
foreach ($spec in $specs) {
    $destination = Join-Path $downloadRoot $spec.Name
    if (-not (Test-Path -LiteralPath $destination)) {
        & curl.exe -L --fail --retry 2 --connect-timeout 30 --max-time 900 --output $destination $spec.Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($spec.Name)" }
    }
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $spec.Hash) { throw "SHA-256 mismatch: $($spec.Name); preserve file for diagnosis" }
    $receipts += [pscustomobject]@{ Name=$spec.Name; Url=$spec.Url; Sha256=$actual; Bytes=(Get-Item -LiteralPath $destination).Length }
}
$msiPath = Join-Path $downloadRoot $specs[0].Name
$signature = Get-AuthenticodeSignature -LiteralPath $msiPath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne '6480532A562B36D1BFFFC5B5EACF7C31E74E9B28') { throw 'Official MSI signature validation failed' }
if ($Extract) {
    $runtimeRoot = Join-Path $engineRoot 'runtime'
    if (Test-Path -LiteralPath $runtimeRoot) { throw 'Refusing to overwrite an existing runtime. Use a fresh engine directory for extraction.' }
    $logPath = Join-Path $evidenceRoot 'msi-admin-extraction.log'
    $arguments = '/a "' + $msiPath + '" /qn TARGETDIR="' + $runtimeRoot + '" /L*v "' + $logPath + '"'
    $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Administrative extraction failed: $($process.ExitCode)" }
}
[pscustomobject]@{ Version=$version; Signer=$signature.SignerCertificate.Subject; SignerThumbprint=$signature.SignerCertificate.Thumbprint; SignatureStatus=[string]$signature.Status; Files=$receipts } | ConvertTo-Json -Depth 5
